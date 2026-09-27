import { GenericAbortedError, GenericConflictError, GenericInternalServerError } from '@/errors/application.errors';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import { mapMasterNodeToMasterNodeEndpoint } from '@/modules/master-nodes/master-node.mappers';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  RecordLeaderHeartbeatInput,
  RecordLeaderHeartbeatResult,
  RequestVoteInput,
  RequestVoteResult
} from './election.application';
import type { ElectionConfig } from './election.config';
import {
  isMasterNodeEligibleCandidate,
  isMasterNodeVotingMember,
  resolveElectionQuorumSize
} from './election.policies';

/* contract */

type ElectionServiceContract = {
  // rpc
  requestVote(input: RequestVoteInput): Promise<RequestVoteResult>;
  recordLeaderHeartbeat(input: RecordLeaderHeartbeatInput): Promise<RecordLeaderHeartbeatResult>;

  // election
  runElection(): Promise<boolean>;
  broadcastLeaderHeartbeat(now?: Date): Promise<void>;
};

/* service */

class ElectionService implements ElectionServiceContract {
  private quorumLossStartedAtMs: number | null = null;

  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly taskService: TaskServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: ElectionConfig
  ) {}

  /* public methods */

  /* rpc methods */

  async requestVote(input: RequestVoteInput): Promise<RequestVoteResult> {
    const consensusState = await this.consensusService.getConsensusState();
    const localLog = await this.resolveLocalLogPosition(consensusState);

    const result = await this.consensusService.requestVote({
      epoch: input.epoch,
      candidateMasterNodeId: input.candidateMasterNodeId,
      candidateLastLogEpoch: input.lastLogEpoch,
      candidateLastLogSequence: input.lastLogSequence,
      localLastLogEpoch: localLog.epoch,
      localLastLogSequence: localLog.sequence
    });

    return {
      epoch: result.state.currentEpoch,
      voteGranted: result.voteGranted
    };
  }

  async recordLeaderHeartbeat(input: RecordLeaderHeartbeatInput): Promise<RecordLeaderHeartbeatResult> {
    const consensusState = await this.consensusService.getConsensusState();

    if (input.epoch < consensusState.currentEpoch) {
      return {
        epoch: consensusState.currentEpoch,
        accepted: false
      };
    }

    if (input.lastCommittedSequence < consensusState.lastCommittedSequence) {
      const state = await this.consensusService.observeEpoch(input.epoch);

      return {
        epoch: state.currentEpoch,
        accepted: false
      };
    }

    try {
      const state = await this.consensusService.acceptFollowership(input.leaderMasterNodeId, input.epoch);

      return {
        epoch: state.currentEpoch,
        accepted: true
      };
    } catch (err) {
      if (!(err instanceof GenericConflictError)) {
        throw err;
      }

      const state = await this.consensusService.getConsensusState();

      return {
        epoch: state.currentEpoch,
        accepted: false
      };
    }
  }

  /* election methods */

  async runElection(): Promise<boolean> {
    const masterNodes = await this.masterNodeService.listMasterNodes();
    const voters = masterNodes.filter(isMasterNodeVotingMember);
    const selfMasterNode = voters.find((masterNode) => masterNode.id === this.selfMasterNodeId);

    if (!selfMasterNode || !isMasterNodeEligibleCandidate(selfMasterNode)) {
      return false;
    }

    let electionState;

    try {
      electionState = await this.consensusService.startElection(this.selfMasterNodeId);
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return false;
      }

      throw err;
    }

    const localLog = await this.resolveLocalLogPosition(electionState);
    const peers = voters.filter((masterNode) => masterNode.id !== this.selfMasterNodeId);

    const results = await Promise.allSettled(
      peers.map((masterNode) =>
        this.masterNodeGrpcClient.requestVote({
          masterNodeEndpoint: mapMasterNodeToMasterNodeEndpoint(masterNode),
          expectedCertificateFingerprint: masterNode.certificateFingerprint,
          epoch: electionState.currentEpoch,
          lastLogEpoch: localLog.epoch,
          lastLogSequence: localLog.sequence
        })
      )
    );

    const responses = results
      .filter((result): result is PromiseFulfilledResult<RequestVoteResult> => result.status === 'fulfilled')
      .map((result) => result.value);
    const highestObservedEpoch = responses.reduce(
      (highestEpoch, response) => (response.epoch > highestEpoch ? response.epoch : highestEpoch),
      electionState.currentEpoch
    );

    if (highestObservedEpoch > electionState.currentEpoch) {
      await this.consensusService.observeEpoch(highestObservedEpoch);
      return false;
    }

    const grantedVoteCount =
      1 + responses.filter((response) => response.epoch === electionState.currentEpoch && response.voteGranted).length;

    if (grantedVoteCount < resolveElectionQuorumSize(voters.length)) {
      return false;
    }

    const currentSelfMasterNode = (await this.masterNodeService.listMasterNodes()).find(
      (masterNode) => masterNode.id === this.selfMasterNodeId
    );

    if (
      !currentSelfMasterNode ||
      !isMasterNodeVotingMember(currentSelfMasterNode) ||
      !isMasterNodeEligibleCandidate(currentSelfMasterNode)
    ) {
      return false;
    }

    try {
      await this.consensusService.completeElection(this.selfMasterNodeId, electionState.currentEpoch);
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return false;
      }

      throw err;
    }

    this.quorumLossStartedAtMs = null;
    await this.broadcastLeaderHeartbeat();

    return true;
  }

  async broadcastLeaderHeartbeat(now = new Date()): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();
    const masterNodes = await this.masterNodeService.listMasterNodes();
    const selfMasterNode = masterNodes.find((masterNode) => masterNode.id === this.selfMasterNodeId);
    const isCurrentLeader = consensusState.leaderMasterId === this.selfMasterNodeId;

    if (!isCurrentLeader) {
      this.quorumLossStartedAtMs = null;
      return;
    }

    const canServeAsLeader =
      selfMasterNode !== undefined && selfMasterNode.state === 'active' && selfMasterNode.mode === 'serving';

    if (!canServeAsLeader) {
      this.quorumLossStartedAtMs = null;
      await this.consensusService.relinquishLeadership(this.selfMasterNodeId, consensusState.currentEpoch);
      return;
    }

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
      this.quorumLossStartedAtMs = null;
      await this.consensusService.observeEpoch(highestObservedEpoch);
      return;
    }

    const acceptedNodeCount =
      1 +
      results.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.epoch === consensusState.currentEpoch && result.value.accepted
      ).length;

    if (acceptedNodeCount >= resolveElectionQuorumSize(masterNodes.filter(isMasterNodeVotingMember).length)) {
      this.quorumLossStartedAtMs = null;
      return;
    }

    if (this.quorumLossStartedAtMs === null) {
      this.quorumLossStartedAtMs = now.getTime();
      return;
    }

    if (now.getTime() - this.quorumLossStartedAtMs >= this.config.timeoutMaxMs) {
      this.quorumLossStartedAtMs = null;
      await this.consensusService.relinquishLeadership(this.selfMasterNodeId, consensusState.currentEpoch);
    }
  }

  /* private methods */

  private async resolveLocalLogPosition(consensusState: ConsensusState): Promise<{
    epoch: bigint;
    sequence: bigint;
  }> {
    if (consensusState.lastAllocatedSequence === -1n) {
      return {
        epoch: 0n,
        sequence: -1n
      };
    }

    const lastTask = await this.taskService.findTaskBySequence(consensusState.lastAllocatedSequence);

    if (!lastTask) {
      throw new GenericInternalServerError('Consensus state references a missing final task entry');
    }

    return {
      epoch: lastTask.epoch,
      sequence: lastTask.sequence
    };
  }
}

/* exports */

export { ElectionService };
export type { ElectionServiceContract };
