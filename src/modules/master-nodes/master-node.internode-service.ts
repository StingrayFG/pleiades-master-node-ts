import type { Buffer } from 'node:buffer';

import { z } from 'zod';

import {
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericForbiddenError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RecordLeaderHeartbeatResult, RequestVoteResult } from '@/modules/election/election.application';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  AuthenticatedMasterNodeCaller,
  InternodeTaskEntry,
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeInternodeInput,
  FetchClusterMembershipSnapshotInternodeInput,
  FetchTaskEntriesInternodeInput,
  FetchTaskEntriesInternodeResult,
  FetchTaskPayloadInternodeInput,
  ForwardTaskInternodeInput,
  RequestVoteInternodeInput,
  RecordLeaderHeartbeatInternodeInput
} from './master-node.application';
import type { MasterNode, MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeInternodeServiceContract = {
  fetchMasterInfo(): Promise<FetchMasterInfoInternodeResult>;
  registerMasterNode(input: RegisterMasterNodeInternodeInput): Promise<void>;
  fetchClusterMembershipSnapshot(
    input: FetchClusterMembershipSnapshotInternodeInput
  ): Promise<ClusterMembershipSnapshot>;
  fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer>;
  forwardTask(input: ForwardTaskInternodeInput): Promise<unknown>;
  requestVote(input: RequestVoteInternodeInput): Promise<RequestVoteResult>;
  recordLeaderHeartbeat(input: RecordLeaderHeartbeatInternodeInput): Promise<RecordLeaderHeartbeatResult>;
};

/* service */

class MasterNodeInternodeService implements MasterNodeInternodeServiceContract {
  constructor(
    private readonly taskService: TaskServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly electionService: ElectionServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly selfMasterNodeSessionId: MasterNodeSessionId,
    private readonly clusterService: ClusterServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract
  ) {}

  /* public methods */

  // used by a bootstrapping follower to learn the leader's identity, session,
  // cluster id, and epoch before registering.
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

  // used by a joining master node registering itself with the leader.
  // the node is recorded as an active serving member and the membership revision advances so
  // followers pick it up in the next snapshot.
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

  // used by a follower whose membership revision fell behind the leader's to sync
  // the cluster membership before continuing replication.
  async fetchClusterMembershipSnapshot(
    input: FetchClusterMembershipSnapshotInternodeInput
  ): Promise<ClusterMembershipSnapshot> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    return this.clusterService.captureMembershipSnapshot();
  }

  // used by followers to replicate the leader's task entries.
  // entries can be uncommitted; the response's committed sequence tells the
  // follower how far they can be applied.
  async fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult> {
    const consensusState = await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);
    const cluster = await this.clusterService.getCluster();

    const tasks = await this.taskService.listTasksInSequenceRange({
      afterSequence: input.afterSequence,
      upToSequence: consensusState.lastAllocatedSequence,
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
      clusterMembershipRevision: cluster.membershipRevision,
      entries
    };
  }

  // used by followers to fetch the byte payload of a dehydrated task entry.
  async fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    return this.taskService.retrieveTaskPayload(input.payloadId);
  }

  // used by followers to hand a task over to the leader for execution.
  async forwardTask(input: ForwardTaskInternodeInput): Promise<unknown> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    const definition = this.taskService.getTaskDefinitionByType(input.type);

    const data = z.decode(definition.dataSchema, input.data);

    const result = await this.taskService.executeTaskByDefinition(definition, data);

    if (result === undefined) {
      return undefined;
    }

    if (!definition.resultSchema) {
      throw new GenericInternalServerError('The task definition does not declare a result schema');
    }

    return z.encode(definition.resultSchema, result);
  }

  // used by an election starter asking for this node's vote.
  // the caller must be a serving member to be eligible for leadership.
  async requestVote(input: RequestVoteInternodeInput): Promise<RequestVoteResult> {
    const electionStarter = await this.requireAuthenticatedMasterNodeCaller(input);

    if (electionStarter.mode !== 'serving') {
      throw new GenericFailedPreconditionError('Calling master node is not eligible to become the cluster leader');
    }

    return this.electionService.requestVote({
      electionStarterMasterNodeId: input.callerMasterNodeId,
      epoch: input.epoch,
      lastLogEpoch: input.lastLogEpoch,
      lastLogSequence: input.lastLogSequence
    });
  }

  // used by the leader to prove it is alive and authoritative.
  // the follower's answer carries its matched sequence back to the leader.
  async recordLeaderHeartbeat(input: RecordLeaderHeartbeatInternodeInput): Promise<RecordLeaderHeartbeatResult> {
    const leader = await this.requireAuthenticatedMasterNodeCaller(input);

    if (leader.id !== input.callerMasterNodeId) {
      throw new GenericForbiddenError('Calling master node cannot claim leadership for another master node');
    }

    if (leader.mode !== 'serving') {
      throw new GenericFailedPreconditionError('Calling master node is not eligible to serve as the cluster leader');
    }

    return this.electionService.recordLeaderHeartbeat({
      leaderMasterNodeId: leader.id,
      epoch: input.epoch,
      lastCommittedSequence: input.lastCommittedSequence
    });
  }

  /* private methods */

  // accepts only registered, active members calling with their registered
  // certificate and current session.
  private async requireAuthenticatedMasterNodeCaller(input: AuthenticatedMasterNodeCaller): Promise<MasterNode> {
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

    return masterNode;
  }

  // gates rpcs that only the current cluster leader may serve.
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
