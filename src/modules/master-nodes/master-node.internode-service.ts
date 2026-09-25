import type { Buffer } from 'node:buffer';

import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskRepositoryContract } from '@/modules/tasks/task.repository';

import type {
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
    private readonly taskRepository: TaskRepositoryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly byteStorageService: ByteStorageServiceContract,
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
    const consensusState = await this.consensusService.getConsensusState();

    const tasks = await this.taskRepository.listTasksInSequenceRange({
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
    return this.byteStorageService.retrieve(input.payloadId);
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
