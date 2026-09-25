import type { Buffer } from 'node:buffer';

import {
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericForbiddenError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  AuthenticatedMasterNodeCaller,
  FetchMasterInfoInternodeResult,
  FetchTaskEntriesInternodeInput,
  FetchTaskEntriesInternodeResult,
  FetchTaskPayloadInternodeInput,
  InternodeTaskEntry,
  RegisterMasterNodeInternodeInput
} from './master-node.application';
import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeInternodeServiceContract = {
  fetchMasterInfo(): Promise<FetchMasterInfoInternodeResult>;
  registerMasterNode(input: RegisterMasterNodeInternodeInput): Promise<void>;
  fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer>;
};

/* service */

class MasterNodeInternodeService implements MasterNodeInternodeServiceContract {
  constructor(
    private readonly taskService: TaskServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly selfMasterNodeSessionId: MasterNodeSessionId,
    private readonly clusterService: ClusterServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract
  ) {}

  async fetchMasterInfo(): Promise<FetchMasterInfoInternodeResult> {
    const consensusState = await this.requireLeadershipState();
    const cluster = await this.clusterService.getCluster();

    return {
      masterId: this.selfMasterNodeId,
      sessionId: this.selfMasterNodeSessionId,
      clusterId: cluster.clusterId,

      epoch: consensusState.currentEpoch
    };
  }

  async registerMasterNode(input: RegisterMasterNodeInternodeInput): Promise<void> {
    await this.requireLeadershipState();

    const cluster = await this.clusterService.getCluster();

    if (input.clusterId !== cluster.clusterId) {
      throw new GenericConflictError('Master node belongs to a different cluster');
    }

    await this.masterNodeService.registerMasterNode({
      id: input.id,

      certificateFingerprint: input.certificateFingerprint,
      sessionId: input.sessionId,
      state: 'active',
      mode: 'serving',

      endpoint: input.endpoint
    });
  }

  async fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult> {
    const consensusState = await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    const tasks = await this.taskService.listTasksInSequenceRange({
      afterSequence: input.afterSequence,
      upToSequence: consensusState.lastCommittedSequence,
      limit: input.limit
    });

    const entries: InternodeTaskEntry[] = tasks.map((task) => ({
      id: task.id,

      originMasterNodeId: task.originMasterNodeId,
      epoch: task.epoch,
      sequence: task.sequence,

      type: task.type,
      executionScope: task.executionScope,
      data: task.data,

      payloadId: task.payloadId,

      createdAt: task.createdAt
    }));

    return {
      epoch: consensusState.currentEpoch,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      entries
    };
  }

  async fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    return this.taskService.retrieveTaskPayload(input.payloadId);
  }

  private async requireAuthenticatedMasterNodeCaller(input: AuthenticatedMasterNodeCaller): Promise<void> {
    let masterNode;

    try {
      masterNode = await this.masterNodeService.getMasterNodeById(input.callerMasterNodeId);
    } catch (err) {
      if (err instanceof GenericNotFoundError) {
        throw new GenericForbiddenError('Calling master node is not registered', { cause: err });
      }

      throw err;
    }

    if (masterNode.certificateFingerprint !== input.callerCertificateFingerprint) {
      throw new GenericForbiddenError('Master node certificate does not match the registered certificate');
    }

    if (masterNode.sessionId !== input.callerMasterNodeSessionId) {
      throw new GenericConflictError('Master node session is no longer current');
    }

    if (masterNode.state !== 'active') {
      throw new GenericFailedPreconditionError('Calling master node is not active');
    }
  }

  private async requireLeadershipState(): Promise<ConsensusState> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId !== this.selfMasterNodeId) {
      throw new GenericFailedPreconditionError(
        'Master node request was rejected because this node is not the cluster leader'
      );
    }

    return consensusState;
  }
}

/* exports */

export { MasterNodeInternodeService };
export type { MasterNodeInternodeServiceContract };
