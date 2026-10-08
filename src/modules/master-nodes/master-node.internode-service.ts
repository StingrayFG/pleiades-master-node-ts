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
import type { RecordLeaderHeartbeatResult } from '@/modules/leadership/leadership.application';
import type { LeadershipServiceContract } from '@/modules/leadership/leadership.service';
import type { RequestVoteResult } from '@/modules/election/election.application';
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
  // bootstrap
  fetchMasterInfo(): Promise<FetchMasterInfoInternodeResult>;
  registerMasterNode(input: RegisterMasterNodeInternodeInput): Promise<void>;

  // membership synchronization
  fetchClusterMembershipSnapshot(
    input: FetchClusterMembershipSnapshotInternodeInput
  ): Promise<ClusterMembershipSnapshot>;

  // task replication
  fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer>;

  // task forwarding
  forwardTask(input: ForwardTaskInternodeInput): Promise<unknown>;

  // election
  requestVote(input: RequestVoteInternodeInput): Promise<RequestVoteResult>;

  // leadership
  recordLeaderHeartbeat(input: RecordLeaderHeartbeatInternodeInput): Promise<RecordLeaderHeartbeatResult>;
};

/* service */

class MasterNodeInternodeService implements MasterNodeInternodeServiceContract {
  constructor(
    private readonly taskService: TaskServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly electionService: ElectionServiceContract,
    private readonly leadershipService: LeadershipServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly selfMasterNodeSessionId: MasterNodeSessionId,
    private readonly clusterService: ClusterServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract
  ) {}

  /* public methods */

  /* bootstrap methods */

  // provides a bootstrapping follower with the leader identity, session,
  // cluster id, and epoch required for registration.
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

  // registers a master node as a joining serving member and advances the
  // membership revision so followers receive it in later snapshots.
  // joining members do not count toward election and commit quorums until they
  // are promoted to active after catching up with the leader's log.
  async registerMasterNode(input: RegisterMasterNodeInternodeInput): Promise<void> {
    const consensusState = await this.requireLeadershipState();

    const cluster = await this.clusterService.getCluster();

    if (input.clusterId !== cluster.clusterId) {
      throw new GenericConflictError('Master node belongs to a different cluster');
    }

    // the registration is fenced on the leadership checked above, so a deposed
    // leader cannot land a membership change
    await this.consensusService.withLeadershipContext(
      {
        epoch: consensusState.currentEpoch,
        leaderMasterId: this.selfMasterNodeId
      },
      (tx) =>
        this.masterNodeService.registerMasterNode(
          {
            id: input.id,

            certificateFingerprint: input.certificateFingerprint,
            sessionId: input.sessionId,
            state: 'joining',
            mode: 'serving',

            endpoint: input.endpoint
          },
          tx
        )
    );
  }

  /* membership synchronization methods */

  // provides a follower with the leader's current cluster membership snapshot.
  async fetchClusterMembershipSnapshot(
    input: FetchClusterMembershipSnapshotInternodeInput
  ): Promise<ClusterMembershipSnapshot> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    return this.clusterService.captureMembershipSnapshot();
  }

  /* task replication methods */

  // returns the next batch of leader task entries and the current committed sequence.
  async fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult> {
    const consensusState = await this.requireLeadershipState();
    const caller = await this.requireAuthenticatedMasterNodeCaller(input);

    // a joining follower that has replicated through the leader's committed sequence
    // has caught up with the committed log and can become an active voting member.
    if (caller.state === 'joining' && input.afterSequence >= consensusState.lastCommittedSequence) {
      await this.consensusService.withLeadershipContext(
        {
          epoch: consensusState.currentEpoch,
          leaderMasterId: this.selfMasterNodeId
        },
        (tx) =>
          this.masterNodeService.registerMasterNode(
            {
              id: caller.id,

              certificateFingerprint: caller.certificateFingerprint,
              sessionId: caller.sessionId,
              state: 'active',
              mode: caller.mode,

              endpoint: {
                hostname: caller.hostname,
                port: caller.port,
                scheme: caller.scheme
              }
            },
            tx
          )
      );
    }

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
      lastAllocatedSequence: consensusState.lastAllocatedSequence,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      clusterMembershipRevision: cluster.membershipRevision,
      entries
    };
  }

  async fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    return this.taskService.retrieveTaskPayload(input.payloadId);
  }

  /* task forwarding methods */

  // executes a task forwarded by a follower and encodes its result for transport.
  async forwardTask(input: ForwardTaskInternodeInput): Promise<unknown> {
    await this.requireLeadershipState();
    await this.requireAuthenticatedMasterNodeCaller(input);

    const definition = this.taskService.getTaskDefinitionByType(input.type);

    const data = z.decode(definition.dataSchema, input.data);

    const result = await this.taskService.executeTaskByDefinition(definition, data);

    if (!definition.resultSchema) {
      if (result !== undefined) {
        throw new GenericInternalServerError('Task execution returned a result without a declared result schema');
      }

      return undefined;
    }

    if (result === undefined) {
      throw new GenericInternalServerError('Task execution did not return its declared result');
    }

    return z.encode(definition.resultSchema, result);
  }

  /* election methods */

  // handles a vote request from an election starter.
  async requestVote(input: RequestVoteInternodeInput): Promise<RequestVoteResult> {
    const electionStarter = await this.requireAuthenticatedMasterNodeCaller(input);

    if (electionStarter.state !== 'active' || electionStarter.mode !== 'serving') {
      throw new GenericFailedPreconditionError('Calling master node is not eligible to become the cluster leader');
    }

    return this.electionService.requestVote({
      electionStarterMasterNodeId: input.callerMasterNodeId,
      epoch: input.epoch,
      lastLogEpoch: input.lastLogEpoch,
      lastLogSequence: input.lastLogSequence
    });
  }

  /* leadership methods */

  // handles a heartbeat from a serving leader and returns this follower's
  // matched sequence progress.
  async recordLeaderHeartbeat(input: RecordLeaderHeartbeatInternodeInput): Promise<RecordLeaderHeartbeatResult> {
    const leader = await this.requireAuthenticatedMasterNodeCaller(input);

    if (leader.id !== input.callerMasterNodeId) {
      throw new GenericForbiddenError('Calling master node cannot claim leadership for another master node');
    }

    if (leader.state !== 'active' || leader.mode !== 'serving') {
      throw new GenericFailedPreconditionError('Calling master node is not eligible to serve as the cluster leader');
    }

    const result = await this.leadershipService.recordLeaderHeartbeat({
      leaderMasterNodeId: leader.id,
      epoch: input.epoch,
      lastCommittedSequence: input.lastCommittedSequence
    });

    if (result.accepted) {
      // record accepted leader activity without coupling it to consensus acceptance.
      try {
        await this.masterNodeService.applyMasterNodeHeartbeat({
          id: leader.id,
          sessionId: leader.sessionId
        });
      } catch {
        // ignore activity recording failures because followership has already been accepted.
      }
    }

    return result;
  }

  /* private methods */

  /* authentication methods */

  // authenticates a registered master node by its certificate and current session.
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

    // joining members may catch up with the leader's log but do not count toward
    // quorums until promoted; all other non-active members are rejected.
    if (masterNode.state !== 'active' && masterNode.state !== 'joining') {
      throw new GenericFailedPreconditionError('Calling master node is not an active cluster member');
    }

    return masterNode;
  }

  /* leadership methods */

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
