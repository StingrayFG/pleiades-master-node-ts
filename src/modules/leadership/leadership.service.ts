import { GenericAbortedError, GenericConflictError, GenericInternalServerError } from '@/errors/application.errors';
import type { ConsensusEpoch } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import {
  isMasterNodeEligibleForElection,
  isMasterNodeVotingMember,
  resolveElectionQuorumSize
} from '@/modules/election/election.policies';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import { mapMasterNodeToMasterNodeEndpoint } from '@/modules/master-nodes/master-node.mappers';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { RecordLeaderHeartbeatInput, RecordLeaderHeartbeatResult } from './leadership.application';
import type { LeadershipConfig } from './leadership.config';

/* contract */

type LeadershipServiceContract = {
  // rpc
  recordLeaderHeartbeat(input: RecordLeaderHeartbeatInput): Promise<RecordLeaderHeartbeatResult>;

  // leadership
  broadcastLeaderHeartbeat(now?: Date): Promise<void>;
  evaluateCommitment(): Promise<void>;
};

/* service */

class LeadershipService implements LeadershipServiceContract {
  private quorumLossStartedAtMs: number | null = null;
  private matchSequenceEpoch: ConsensusEpoch | null = null;

  // tracks each voting follower's latest reported matched sequence for the current leader epoch.
  // matched sequence progress gets reported in responses to leader heartbeats.
  // reports from non-voting or removed followers are ignored.
  private readonly latestMatchedSequencesByMasterNodeId = new Map<MasterNodeId, bigint>();

  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly taskService: TaskServiceContract,
    private readonly taskApplyHandler: TaskApplyHandlerContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: LeadershipConfig
  ) {}

  /* public methods */

  /* rpc methods */

  // handles a heartbeat from the current leader by validating its epoch,
  // refreshing local followership, and returning local matched sequence progress.
  // the leader's committed sequence may transiently lag the local one after an
  // election; the local committed sequence never moves backward regardless
  async recordLeaderHeartbeat(input: RecordLeaderHeartbeatInput): Promise<RecordLeaderHeartbeatResult> {
    const consensusState = await this.consensusService.getConsensusState();

    if (input.epoch < consensusState.currentEpoch) {
      return {
        epoch: consensusState.currentEpoch,
        lastMatchedSequence: consensusState.lastMatchedSequence,
        accepted: false
      };
    }

    try {
      const state = await this.consensusService.acceptFollowership({
        epoch: input.epoch,
        leaderMasterId: input.leaderMasterNodeId
      });

      return {
        epoch: state.currentEpoch,
        lastMatchedSequence: state.lastMatchedSequence,
        accepted: true
      };
    } catch (err) {
      if (!(err instanceof GenericConflictError)) {
        throw err;
      }

      const state = await this.consensusService.getConsensusState();

      return {
        epoch: state.currentEpoch,
        lastMatchedSequence: state.lastMatchedSequence,
        accepted: false
      };
    }
  }

  /* leadership methods */

  // broadcasts the leader's epoch and committed sequence to voting followers,
  // collects their matched sequence progress, and releases leadership if a quorum
  // remains unreachable for the configured timeout.
  async broadcastLeaderHeartbeat(now = new Date()): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();
    const masterNodes = await this.masterNodeService.listMasterNodes();
    const selfMasterNode = masterNodes.find((masterNode) => masterNode.id === this.selfMasterNodeId);
    const isCurrentLeader = consensusState.leaderMasterId === this.selfMasterNodeId;

    if (!isCurrentLeader) {
      this.clearLeadershipProgress();
      return;
    }

    if (!selfMasterNode || !isMasterNodeEligibleForElection(selfMasterNode)) {
      this.clearLeadershipProgress();
      await this.consensusService.releaseLeadership({
        epoch: consensusState.currentEpoch,
        leaderMasterId: this.selfMasterNodeId
      });
      return;
    }

    this.synchronizeMatchSequenceProgress(consensusState.currentEpoch);

    const peers = masterNodes.filter(
      (masterNode) => isMasterNodeVotingMember(masterNode) && masterNode.id !== this.selfMasterNodeId
    );

    const results = await Promise.allSettled(
      peers.map((masterNode) =>
        this.masterNodeGrpcClient.recordLeaderHeartbeat({
          masterNodeEndpoint: mapMasterNodeToMasterNodeEndpoint(masterNode),
          expectedCertificateFingerprint: masterNode.certificateFingerprint,
          epoch: consensusState.currentEpoch,
          lastCommittedSequence: consensusState.lastCommittedSequence
        })
      )
    );

    const highestObservedEpoch = results.reduce((highestEpoch, result) => {
      if (result.status === 'rejected' || result.value.epoch <= highestEpoch) {
        return highestEpoch;
      }

      return result.value.epoch;
    }, consensusState.currentEpoch);

    if (highestObservedEpoch > consensusState.currentEpoch) {
      this.clearLeadershipProgress();
      await this.consensusService.adoptNewerEpoch(highestObservedEpoch);
      return;
    }

    results.forEach((result, index) => {
      if (
        result.status === 'fulfilled' &&
        result.value.accepted &&
        result.value.epoch === consensusState.currentEpoch
      ) {
        this.latestMatchedSequencesByMasterNodeId.set(peers[index].id, result.value.lastMatchedSequence);
      }
    });

    const acceptedNodeCount =
      1 +
      results.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.epoch === consensusState.currentEpoch && result.value.accepted
      ).length;

    if (acceptedNodeCount >= resolveElectionQuorumSize(masterNodes.filter(isMasterNodeVotingMember).length)) {
      this.quorumLossStartedAtMs = null;
      await this.evaluateCommitment();
      return;
    }

    if (this.quorumLossStartedAtMs === null) {
      this.quorumLossStartedAtMs = now.getTime();
      return;
    }

    if (now.getTime() - this.quorumLossStartedAtMs >= this.config.quorumLossTimeoutMs) {
      this.clearLeadershipProgress();
      await this.consensusService.releaseLeadership({
        epoch: consensusState.currentEpoch,
        leaderMasterId: this.selfMasterNodeId
      });
    }
  }

  /* commitment methods */

  // advances the committed sequence to the highest current-epoch matched sequence reported by
  // a quorum of voting master nodes.
  // committing task with the latest matched sequence also commits all preceding tasks.
  async evaluateCommitment(): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId !== this.selfMasterNodeId) {
      return;
    }

    this.synchronizeMatchSequenceProgress(consensusState.currentEpoch);

    const masterNodes = await this.masterNodeService.listMasterNodes();
    const voters = masterNodes.filter(isMasterNodeVotingMember);
    const quorumSize = resolveElectionQuorumSize(voters.length);

    const matchedSequences = voters.map((voter) =>
      voter.id === this.selfMasterNodeId
        ? consensusState.lastAllocatedSequence
        : (this.latestMatchedSequencesByMasterNodeId.get(voter.id) ?? -1n)
    );

    matchedSequences.sort((left, right) => (left > right ? -1 : left < right ? 1 : 0));

    const candidateSequence = matchedSequences[quorumSize - 1];

    if (candidateSequence <= consensusState.lastCommittedSequence) {
      return;
    }

    const candidateTask = await this.taskService.findTaskBySequence(candidateSequence);

    if (!candidateTask) {
      throw new GenericInternalServerError('Consensus state references a missing final task entry');
    }

    if (candidateTask.epoch !== consensusState.currentEpoch) {
      return;
    }

    try {
      await this.consensusService.advanceLastCommittedSequence(candidateSequence, {
        epoch: consensusState.currentEpoch,
        leaderMasterId: this.selfMasterNodeId
      });
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return;
      }

      throw err;
    }

    // trigger an immediate apply attempt to reduce latency;
    // the periodic apply cycle will remain responsible for recovery.
    try {
      await this.taskApplyHandler.run();
    } catch {
      // ignore transient apply failures here;
      // committed tasks remain available for the periodic apply cycle.
    }
  }

  /* private methods */

  private synchronizeMatchSequenceProgress(epoch: ConsensusEpoch): void {
    if (this.matchSequenceEpoch === epoch) {
      return;
    }

    this.latestMatchedSequencesByMasterNodeId.clear();
    this.matchSequenceEpoch = epoch;
  }

  private clearLeadershipProgress(): void {
    this.quorumLossStartedAtMs = null;
    this.matchSequenceEpoch = null;
    this.latestMatchedSequencesByMasterNodeId.clear();
  }
}

/* exports */

export { LeadershipService };
export type { LeadershipServiceContract };
