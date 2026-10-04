import { GenericAbortedError, GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusLeadershipContext } from '@/modules/consensus/consensus.application';
import type { ConsensusLastSequence } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  ReconcileTaskHistoryInput,
  ReplicateTaskEntriesInput,
  ReplicateTaskEntryInput,
  SynchronizeClusterMembershipInput,
  VerifyTaskEntriesFetchResultInput
} from './master-node.application';
import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import { mapMasterNodeToMasterNodeEndpoint } from './master-node.mappers';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeReplicationHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class MasterNodeReplicationHandler implements MasterNodeReplicationHandlerContract {
  constructor(
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly taskService: TaskServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly clusterService: ClusterServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly masterNodeConfig: MasterNodeConfig
  ) {}

  // used only by followers to synchronize membership, leadership context,
  // and task history with the current leader.
  async run(): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId === null || consensusState.leaderMasterId === this.selfMasterNodeId) {
      return;
    }

    const leader = await this.masterNodeService.getMasterNodeById(consensusState.leaderMasterId);

    const leaderEndpoint = mapMasterNodeToMasterNodeEndpoint(leader);

    const fetchResult = await this.masterNodeGrpcClient.fetchTaskEntries({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leader.certificateFingerprint,
      afterSequence: consensusState.lastCommittedSequence,
      limit: this.masterNodeConfig.replication.batchSize
    });

    this.verifyFetchResult({
      consensusState,
      fetchResult
    });

    await this.synchronizeClusterMembership({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leader.certificateFingerprint,
      leaderMembershipRevision: fetchResult.clusterMembershipRevision
    });

    const followerState = await this.consensusService.acceptFollowership({
      epoch: fetchResult.epoch,
      leaderMasterId: consensusState.leaderMasterId
    });

    if (
      followerState.currentEpoch !== fetchResult.epoch ||
      followerState.leaderMasterId !== consensusState.leaderMasterId
    ) {
      throw new GenericAbortedError('Task replication was aborted because cluster leadership changed');
    }

    const leadershipContext: ConsensusLeadershipContext = {
      epoch: fetchResult.epoch,
      leaderMasterId: consensusState.leaderMasterId
    };

    const replicatedThroughSequence = await this.replicateTaskEntries({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leader.certificateFingerprint,
      entries: fetchResult.entries,
      initialSequence: consensusState.lastCommittedSequence,
      leaderLastCommittedSequence: fetchResult.lastCommittedSequence,
      leadershipContext
    });

    await this.reconcileTaskHistory({
      consensusState,
      replicatedThroughSequence,
      leaderLastCommittedSequence: fetchResult.lastCommittedSequence,
      leadershipContext
    });

    // record matched sequence progress through the entries verified against this leader.
    await this.consensusService.advanceLastMatchedSequence(replicatedThroughSequence, leadershipContext);
  }

  /* private methods */

  private verifyFetchResult(input: VerifyTaskEntriesFetchResultInput): void {
    if (input.fetchResult.epoch < input.consensusState.currentEpoch) {
      throw new GenericFailedPreconditionError('The leader returned a stale consensus epoch');
    }

    if (input.fetchResult.lastCommittedSequence < input.consensusState.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('The leader returned a regressed committed sequence');
    }

    if (input.fetchResult.entries.length > this.masterNodeConfig.replication.batchSize) {
      throw new GenericFailedPreconditionError('The leader returned more task entries than requested');
    }
  }

  private async synchronizeClusterMembership(input: SynchronizeClusterMembershipInput): Promise<void> {
    const cluster = await this.clusterService.getCluster();

    if (input.leaderMembershipRevision < cluster.membershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a regressed cluster membership revision');
    }

    if (input.leaderMembershipRevision === cluster.membershipRevision) {
      return;
    }

    // apply newer leader membership before accepting its leadership context.
    const snapshot = await this.masterNodeGrpcClient.fetchClusterMembershipSnapshot({
      masterNodeEndpoint: input.masterNodeEndpoint,
      expectedCertificateFingerprint: input.expectedCertificateFingerprint
    });

    if (snapshot.cluster.membershipRevision < input.leaderMembershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a stale cluster membership snapshot');
    }

    await this.clusterService.applyMembershipSnapshot(snapshot);
  }

  private async replicateTaskEntries(input: ReplicateTaskEntriesInput): Promise<ConsensusLastSequence> {
    let replicatedThroughSequence = input.initialSequence;

    // replicate task entries in sequence, replacing the local tail when a leader entry
    // differs from the entry already stored at the same sequence locally.
    for (const entry of input.entries) {
      if (entry.sequence !== replicatedThroughSequence + 1n) {
        throw new GenericFailedPreconditionError('The leader returned a non-contiguous task sequence');
      }

      try {
        await this.replicateTaskEntry({
          masterNodeEndpoint: input.masterNodeEndpoint,
          expectedCertificateFingerprint: input.expectedCertificateFingerprint,
          entry,
          leadershipContext: input.leadershipContext
        });
      } catch (err) {
        if (!(err instanceof GenericConflictError)) {
          throw err;
        }

        await this.taskService.deleteTasksFromSequence(entry.sequence, input.leadershipContext);
        await this.replicateTaskEntry({
          masterNodeEndpoint: input.masterNodeEndpoint,
          expectedCertificateFingerprint: input.expectedCertificateFingerprint,
          entry,
          leadershipContext: input.leadershipContext
        });
      }

      replicatedThroughSequence = entry.sequence;
    }

    return replicatedThroughSequence;
  }

  private async replicateTaskEntry(input: ReplicateTaskEntryInput): Promise<void> {
    const payload =
      input.entry.payloadId === null
        ? undefined
        : await this.masterNodeGrpcClient.fetchTaskPayload({
            masterNodeEndpoint: input.masterNodeEndpoint,
            expectedCertificateFingerprint: input.expectedCertificateFingerprint,
            payloadId: input.entry.payloadId
          });

    await this.taskService.replicateTask(
      {
        ...input.entry,
        payload
      },
      input.leadershipContext
    );
  }

  private async reconcileTaskHistory(input: ReconcileTaskHistoryInput): Promise<void> {
    // remove a local tail beyond the leader's committed history once this pass catches up.
    if (
      input.replicatedThroughSequence === input.leaderLastCommittedSequence &&
      input.consensusState.lastAllocatedSequence > input.leaderLastCommittedSequence
    ) {
      await this.taskService.deleteTasksFromSequence(
        input.leaderLastCommittedSequence + 1n,
        input.leadershipContext
      );
    }

    const nextCommittedSequence =
      input.replicatedThroughSequence < input.leaderLastCommittedSequence
        ? input.replicatedThroughSequence
        : input.leaderLastCommittedSequence;

    // advance commitment only through entries available locally.
    if (nextCommittedSequence > input.consensusState.lastCommittedSequence) {
      await this.consensusService.advanceLastCommittedSequence(nextCommittedSequence, input.leadershipContext);
    }
  }
}

/* exports */

export { MasterNodeReplicationHandler };
export type { MasterNodeReplicationHandlerContract };
