import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError
} from '@/errors/application.errors';
import type { ClusterMembershipRevision } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusLeadershipContext } from '@/modules/consensus/consensus.application';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskSequence } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { FetchTaskEntriesInternodeResult, InternodeTaskEntry } from './master-node.application';
import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeCertificateFingerprint, MasterNodeEndpoint, MasterNodeId } from './master-node.domain';
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

    this.verifyFetchResult(consensusState, fetchResult);

    await this.synchronizeClusterMembership(
      leaderEndpoint,
      leader.certificateFingerprint,
      fetchResult.clusterMembershipRevision
    );

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

    const replicatedThroughSequence = await this.replicateEntries(
      leaderEndpoint,
      leader.certificateFingerprint,
      fetchResult.entries,
      consensusState.lastCommittedSequence,
      fetchResult.lastCommittedSequence,
      leadershipContext
    );

    await this.reconcileTaskHistory(
      consensusState,
      replicatedThroughSequence,
      fetchResult.lastCommittedSequence,
      leadershipContext
    );

    // the pass verified the local log against the leader's through this sequence, so it
    // becomes the highest entry this node can vouch for in heartbeat acknowledgments
    await this.consensusService.advanceLastMatchedSequence(replicatedThroughSequence, leadershipContext);
  }

  /* private methods */

  private verifyFetchResult(consensusState: ConsensusState, fetchResult: FetchTaskEntriesInternodeResult): void {
    if (fetchResult.epoch < consensusState.currentEpoch) {
      throw new GenericFailedPreconditionError('The leader returned a stale consensus epoch');
    }

    if (fetchResult.lastCommittedSequence < consensusState.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('The leader returned a regressed committed sequence');
    }

    if (fetchResult.entries.length > this.masterNodeConfig.replication.batchSize) {
      throw new GenericFailedPreconditionError('The leader returned more task entries than requested');
    }
  }

  private async synchronizeClusterMembership(
    masterNodeEndpoint: MasterNodeEndpoint,
    expectedCertificateFingerprint: MasterNodeCertificateFingerprint,
    leaderMembershipRevision: ClusterMembershipRevision
  ): Promise<void> {
    const cluster = await this.clusterService.getCluster();

    if (leaderMembershipRevision < cluster.membershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a regressed cluster membership revision');
    }

    if (leaderMembershipRevision === cluster.membershipRevision) {
      return;
    }

    const snapshot = await this.masterNodeGrpcClient.fetchClusterMembershipSnapshot({
      masterNodeEndpoint,
      expectedCertificateFingerprint
    });

    if (snapshot.cluster.membershipRevision < leaderMembershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a stale cluster membership snapshot');
    }

    await this.clusterService.applyMembershipSnapshot(snapshot);
  }

  private async replicateEntries(
    masterNodeEndpoint: MasterNodeEndpoint,
    expectedCertificateFingerprint: MasterNodeCertificateFingerprint,
    entries: InternodeTaskEntry[],
    initialSequence: TaskSequence,
    leaderLastCommittedSequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<TaskSequence> {
    let replicatedThroughSequence = initialSequence;

    for (const entry of entries) {
      if (entry.sequence !== replicatedThroughSequence + 1n) {
        throw new GenericFailedPreconditionError('The leader returned a non-contiguous task sequence');
      }

      try {
        await this.replicateEntry(masterNodeEndpoint, expectedCertificateFingerprint, entry, leadershipContext);
      } catch (err) {
        if (!(err instanceof GenericConflictError)) {
          throw err;
        }

        await this.taskService.deleteTasksFromSequence(entry.sequence, leadershipContext);
        await this.replicateEntry(masterNodeEndpoint, expectedCertificateFingerprint, entry, leadershipContext);
      }

      replicatedThroughSequence = entry.sequence;
    }

    return replicatedThroughSequence;
  }

  private async replicateEntry(
    masterNodeEndpoint: MasterNodeEndpoint,
    expectedCertificateFingerprint: MasterNodeCertificateFingerprint,
    entry: InternodeTaskEntry,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<void> {
    const payload =
      entry.payloadId === null
        ? undefined
        : await this.masterNodeGrpcClient.fetchTaskPayload({
            masterNodeEndpoint,
            expectedCertificateFingerprint,
            payloadId: entry.payloadId
          });

    await this.taskService.replicateTask(
      {
        ...entry,
        payload
      },
      leadershipContext
    );
  }

  private async reconcileTaskHistory(
    consensusState: ConsensusState,
    replicatedThroughSequence: TaskSequence,
    leaderLastCommittedSequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<void> {
    if (
      replicatedThroughSequence === leaderLastCommittedSequence &&
      consensusState.lastAllocatedSequence > leaderLastCommittedSequence
    ) {
      await this.taskService.deleteTasksFromSequence(leaderLastCommittedSequence + 1n, leadershipContext);
    }

    const nextCommittedSequence =
      replicatedThroughSequence < leaderLastCommittedSequence ? replicatedThroughSequence : leaderLastCommittedSequence;

    if (nextCommittedSequence > consensusState.lastCommittedSequence) {
      await this.consensusService.advanceLastCommittedSequence(nextCommittedSequence, leadershipContext);
    }
  }
}

/* exports */

export { MasterNodeReplicationHandler };
export type { MasterNodeReplicationHandlerContract };
