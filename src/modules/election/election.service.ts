import { GenericAbortedError, GenericInternalServerError } from '@/errors/application.errors';
import type { ConsensusEpoch, ConsensusLogPosition, ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNode, MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import { mapMasterNodeToMasterNodeEndpoint } from '@/modules/master-nodes/master-node.mappers';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { RequestVoteInput, RequestVoteResult } from './election.application';
import type { ElectionConfig } from './election.config';
import {
  isMasterNodeVotingMember,
  isSelfMasterNodeEligibleForElection,
  resolveElectionQuorumSize
} from './election.policies';

/* contract */

type ElectionServiceContract = {
  // rpc
  requestVote(input: RequestVoteInput): Promise<RequestVoteResult>;

  // election
  runElection(): Promise<boolean>;
};

/* service */

class ElectionService implements ElectionServiceContract {
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
      electionStarterMasterNodeId: input.electionStarterMasterNodeId,
      electionStarterLastLogEpoch: input.lastLogEpoch,
      electionStarterLastLogSequence: input.lastLogSequence,
      localLastLogEpoch: localLog.epoch,
      localLastLogSequence: localLog.sequence
    });

    return {
      epoch: result.state.currentEpoch,
      voteGranted: result.voteGranted
    };
  }

  /* election methods */

  async runElection(): Promise<boolean> {
    const voters = await this.resolveVotingMasterNodes();
    const selfMasterNode = voters.find((masterNode) => masterNode.id === this.selfMasterNodeId);

    if (!isSelfMasterNodeEligibleForElection(selfMasterNode)) {
      return false;
    }

    let electionState;

    try {
      electionState = await this.consensusService.startElection();
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return false;
      }

      throw err;
    }

    const responses = await this.collectVotesFromMasterNodes(voters, electionState);
    const summary = this.summarizeVotes(responses, electionState.currentEpoch);

    if (summary.highestObservedEpoch > electionState.currentEpoch) {
      await this.consensusService.adoptNewerEpoch(summary.highestObservedEpoch);
      return false;
    }

    if (summary.grantedVoteCount < resolveElectionQuorumSize(voters.length)) {
      return false;
    }

    const currentSelfMasterNode = (await this.resolveVotingMasterNodes()).find(
      (masterNode) => masterNode.id === this.selfMasterNodeId
    );

    if (!isSelfMasterNodeEligibleForElection(currentSelfMasterNode)) {
      return false;
    }

    try {
      await this.consensusService.completeElection(electionState.currentEpoch, this.selfMasterNodeId);
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return false;
      }

      throw err;
    }

    return true;
  }

  /* private methods */

  private async resolveLocalLogPosition(consensusState: ConsensusState): Promise<ConsensusLogPosition> {
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

  private async resolveVotingMasterNodes(): Promise<MasterNode[]> {
    const masterNodes = await this.masterNodeService.listMasterNodes();

    return masterNodes.filter(isMasterNodeVotingMember);
  }

  private async collectVotesFromMasterNodes(
    voters: MasterNode[],
    electionState: ConsensusState
  ): Promise<RequestVoteResult[]> {
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

    return results
      .filter((result): result is PromiseFulfilledResult<RequestVoteResult> => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  private summarizeVotes(
    votes: RequestVoteResult[],
    electionEpoch: ConsensusEpoch
  ): {
    highestObservedEpoch: ConsensusEpoch;
    grantedVoteCount: number;
  } {
    const highestObservedEpoch = votes.reduce(
      (highestEpoch, vote) => (vote.epoch > highestEpoch ? vote.epoch : highestEpoch),
      electionEpoch
    );

    const grantedVoteCount = 1 + votes.filter((vote) => vote.epoch === electionEpoch && vote.voteGranted).length;

    return {
      highestObservedEpoch,
      grantedVoteCount
    };
  }
}

/* exports */

export { ElectionService };
export type { ElectionServiceContract };
