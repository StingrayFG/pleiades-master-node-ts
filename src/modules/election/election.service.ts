import { GenericAbortedError, GenericInternalServerError } from '@/errors/application.errors';
import type {
  ConsensusEpoch,
  ConsensusLogPosition,
  ConsensusState,
  ConsensusVotingConfiguration
} from '@/modules/consensus/consensus.domain';
import {
  areConsensusVotingConfigurationsEqual,
  hasConsensusVotingQuorum,
  isElectionStarterLogUpToDate,
  isConsensusVoter,
  listConsensusVoterMasterNodeIds
} from '@/modules/consensus/consensus.policies';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ConsensusVotingConfigurationServiceContract } from '@/modules/consensus/consensus.voting-configuration-service';
import type { MasterNode, MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import { mapMasterNodeToMasterNodeEndpoint } from '@/modules/master-nodes/master-node.mappers';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  RequestPreVoteInput,
  RequestPreVoteResult,
  RequestVoteInput,
  RequestVoteResult
} from './election.application';
import type { ElectionConfig } from './election.config';
import { isSelfMasterNodeEligibleForElection } from './election.policies';

/* contract */

type ElectionServiceContract = {
  // voting
  requestPreVote(input: RequestPreVoteInput, now?: Date): Promise<RequestPreVoteResult>;
  requestVote(input: RequestVoteInput): Promise<RequestVoteResult>;

  // election
  runElection(): Promise<boolean>;
};

/* service */

class ElectionService implements ElectionServiceContract {
  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly consensusVotingConfigurationService: ConsensusVotingConfigurationServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly taskService: TaskServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: ElectionConfig
  ) {}

  /* public methods */

  /* voting methods */

  async requestPreVote(input: RequestPreVoteInput, now = new Date()): Promise<RequestPreVoteResult> {
    const consensusState = await this.consensusService.getConsensusState();
    const votingConfiguration = await this.consensusVotingConfigurationService.resolveVotingConfiguration(
      consensusState.lastAllocatedSequence
    );
    const leaderContactIsRecent =
      consensusState.lastLeaderContactAt !== null &&
      now.getTime() - consensusState.lastLeaderContactAt.getTime() < this.config.timeoutMinMs;

    if (
      !isConsensusVoter(votingConfiguration, this.selfMasterNodeId) ||
      !isConsensusVoter(votingConfiguration, input.electionStarterMasterNodeId) ||
      input.prospectiveEpoch <= consensusState.currentEpoch ||
      consensusState.leaderMasterId === this.selfMasterNodeId ||
      leaderContactIsRecent
    ) {
      return {
        currentEpoch: consensusState.currentEpoch,
        preVoteGranted: false
      };
    }

    const localLog = await this.resolveLocalLogPosition(consensusState);
    const preVoteGranted = isElectionStarterLogUpToDate({
      epoch: input.prospectiveEpoch,
      electionStarterMasterNodeId: input.electionStarterMasterNodeId,
      electionStarterLastLogEpoch: input.lastLogEpoch,
      electionStarterLastLogSequence: input.lastLogSequence,
      localLastLogEpoch: localLog.epoch,
      localLastLogSequence: localLog.sequence
    });

    return {
      currentEpoch: consensusState.currentEpoch,
      preVoteGranted
    };
  }

  async requestVote(input: RequestVoteInput): Promise<RequestVoteResult> {
    const consensusState = await this.consensusService.getConsensusState();
    const votingConfiguration = await this.consensusVotingConfigurationService.resolveVotingConfiguration(
      consensusState.lastAllocatedSequence
    );

    if (
      !isConsensusVoter(votingConfiguration, this.selfMasterNodeId) ||
      !isConsensusVoter(votingConfiguration, input.electionStarterMasterNodeId)
    ) {
      return {
        epoch: consensusState.currentEpoch,
        voteGranted: false
      };
    }

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
    const initialConsensusState = await this.consensusService.getConsensusState();
    const votingConfiguration = await this.consensusVotingConfigurationService.resolveVotingConfiguration(
      initialConsensusState.lastAllocatedSequence
    );
    const voters = await this.resolveVotingMasterNodes(votingConfiguration);
    const selfMasterNode = voters.find((masterNode) => masterNode.id === this.selfMasterNodeId);

    if (!isSelfMasterNodeEligibleForElection(selfMasterNode, votingConfiguration)) {
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

    if (!hasConsensusVotingQuorum(votingConfiguration, summary.grantedVoterMasterNodeIds)) {
      return false;
    }

    const currentConsensusState = await this.consensusService.getConsensusState();
    const currentVotingConfiguration = await this.consensusVotingConfigurationService.resolveVotingConfiguration(
      currentConsensusState.lastAllocatedSequence
    );
    const currentSelfMasterNode = (await this.resolveVotingMasterNodes(currentVotingConfiguration)).find(
      (masterNode) => masterNode.id === this.selfMasterNodeId
    );

    if (
      !areConsensusVotingConfigurationsEqual(votingConfiguration, currentVotingConfiguration) ||
      !isSelfMasterNodeEligibleForElection(currentSelfMasterNode, currentVotingConfiguration)
    ) {
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

  private async resolveVotingMasterNodes(votingConfiguration: ConsensusVotingConfiguration): Promise<MasterNode[]> {
    const masterNodes = await this.masterNodeService.listMasterNodes();
    const voterMasterNodeIds = new Set(listConsensusVoterMasterNodeIds(votingConfiguration));

    return masterNodes.filter((masterNode) => voterMasterNodeIds.has(masterNode.id));
  }

  private async collectVotesFromMasterNodes(
    voters: MasterNode[],
    electionState: ConsensusState
  ): Promise<Array<{ masterNodeId: MasterNodeId; result: RequestVoteResult }>> {
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

    return results.flatMap((result, index) => {
      if (result.status === 'rejected') {
        return [];
      }

      return [
        {
          masterNodeId: peers[index].id,
          result: result.value
        }
      ];
    });
  }

  private summarizeVotes(
    votes: Array<{ masterNodeId: MasterNodeId; result: RequestVoteResult }>,
    electionEpoch: ConsensusEpoch
  ): {
    highestObservedEpoch: ConsensusEpoch;
    grantedVoterMasterNodeIds: MasterNodeId[];
  } {
    const highestObservedEpoch = votes.reduce(
      (highestEpoch, vote) => (vote.result.epoch > highestEpoch ? vote.result.epoch : highestEpoch),
      electionEpoch
    );

    const grantedVoterMasterNodeIds = [
      this.selfMasterNodeId,
      ...votes
        .filter((vote) => vote.result.epoch === electionEpoch && vote.result.voteGranted)
        .map((vote) => vote.masterNodeId)
    ];

    return {
      highestObservedEpoch,
      grantedVoterMasterNodeIds
    };
  }
}

/* exports */

export { ElectionService };
export type { ElectionServiceContract };
