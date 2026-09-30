import { GenericAbortedError, GenericAlreadyExistsError } from '@/errors/application.errors';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { TaskSequence } from '@/modules/tasks/task.domain';

import type {
  AllocatedSequenceTransactionAction,
  ConsensusLeadershipContext,
  ConsensusVoteResult,
  RequestConsensusVoteInput,
  RewoundSequenceTransactionAction
} from './consensus.application';
import type { ConsensusEpoch, ConsensusLastSequence, ConsensusState } from './consensus.domain';
import { isElectionStarterLogUpToDate } from './consensus.policies';
import type { ConsensusStateRepositoryContract } from './consensus.repository';
import {
  verifyAppliedSequenceWithinCommitted,
  verifyCommittedSequenceWithinAllocated,
  verifyElectionCompleted,
  verifyElectionStarted,
  verifyNewerEpochAdopted,
  verifyFollowershipAcceptable,
  verifyFollowershipAccepted,
  verifyLeadershipSequenceAdvancementNotAborted,
  verifyLeadershipReleased,
  verifyMatchedSequenceWithinAllocated,
  verifySequenceAdvancementNotAborted,
  verifySequenceWithinRewindBounds
} from './consensus.verifiers';

/* contract */

type ConsensusServiceContract = {
  // state
  getConsensusState(): Promise<ConsensusState>;

  // sequence
  advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastCommittedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;
  withRewoundLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // leadership
  claimInitialLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  acceptFollowership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState>;
  releaseLeadership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState>;

  // election
  startElection(): Promise<ConsensusState>;
  completeElection(epoch: ConsensusEpoch, electionStarterMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  adoptNewerEpoch(epoch: ConsensusEpoch): Promise<ConsensusState>;
  requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult>;
};

/* service */

class ConsensusService implements ConsensusServiceContract {
  constructor(
    private readonly repository: ConsensusStateRepositoryContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  /* state methods */

  async getConsensusState(): Promise<ConsensusState> {
    const existingState = await this.repository.findState();

    if (existingState) {
      return existingState;
    }

    try {
      return await this.repository.createState();
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      const createdState = await this.repository.findState();

      if (!createdState) {
        throw err;
      }

      return createdState;
    }
  }

  /* sequence methods */

  async advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    await this.getConsensusState();

    const updatedState = await this.repository.advanceLastAllocatedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedState,
        leadershipContext,
        sequence,
        updatedState.lastAllocatedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Allocated sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedState;
  }

  async advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    verifyMatchedSequenceWithinAllocated(state, sequence);

    const updatedState = await this.repository.advanceLastMatchedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedState,
        leadershipContext,
        sequence,
        updatedState.lastMatchedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Matched sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedState;
  }

  async advanceLastCommittedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    verifyCommittedSequenceWithinAllocated(state, sequence);

    const updatedState = await this.repository.advanceLastCommittedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedState,
        leadershipContext,
        sequence,
        updatedState.lastCommittedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Committed sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedState;
  }

  async advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    verifyAppliedSequenceWithinCommitted(state, sequence);

    const updatedState = await this.repository.advanceLastAppliedSequence({
      sequence
    });

    try {
      verifySequenceAdvancementNotAborted(sequence, updatedState.lastAppliedSequence);
    } catch (err) {
      throw new GenericAbortedError('Applied sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedState;
  }

  // runs the action in the same transaction that advances the last allocated sequence.
  async withAdvancedLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    await this.getConsensusState();

    return this.repository.withAdvancedLastAllocatedSequence(
      {
        leadershipContext
      },
      action
    );
  }

  // runs the action in the same transaction that rewinds the last allocated sequence.
  async withRewoundLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    const state = await this.getConsensusState();

    verifySequenceWithinRewindBounds(state, sequence);

    return this.repository.withRewoundLastAllocatedSequence(
      {
        sequence,
        leadershipContext
      },
      action
    );
  }

  /* leadership methods */

  // used during initial cluster bootstrap to claim leadership before any leader exists.
  // this transition advances the epoch and records the bootstrapping node as leader with its self-vote.
  async claimInitialLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (state.leaderMasterId === selfMasterNodeId) {
      return state;
    }

    if (state.leaderMasterId !== null) {
      return state;
    }

    await this.repository.claimLeadership({
      leadershipContext: {
        epoch: state.currentEpoch + 1n,
        leaderMasterId: selfMasterNodeId
      },
      lastLeaderContactAt: new Date(),
      matchedSequence: state.lastCommittedSequence
    });

    return this.getConsensusState();
  }

  // used locally by a node becoming or staying a follower when bootstrap, replication,
  // or a heartbeat confirms a remote leader for the current or a newer epoch.
  // this transition records the remote leader and contact time, resetting matched sequence progress if leadership changed.
  async acceptFollowership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    verifyFollowershipAcceptable(state, leadershipContext);

    // reset the matched sequence if the leader or epoch has changed
    const matchedSequence =
      state.currentEpoch !== leadershipContext.epoch || state.leaderMasterId !== leadershipContext.leaderMasterId
        ? state.lastCommittedSequence
        : state.lastMatchedSequence;

    await this.repository.acceptFollowership({
      leadershipContext,
      lastLeaderContactAt: new Date(),
      matchedSequence
    });

    const followerState = await this.getConsensusState();

    verifyFollowershipAccepted(followerState, leadershipContext);

    return followerState;
  }

  // used by the leader when it becomes ineligible or loses contact with the quorum.
  // this transition clears the known leader and resets matched sequence progress without advancing the epoch.
  async releaseLeadership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState> {
    const previousState = await this.getConsensusState();

    await this.repository.releaseLeadership({
      leadershipContext,
      matchedSequence: previousState.lastCommittedSequence
    });

    const state = await this.getConsensusState();

    verifyLeadershipReleased(state, leadershipContext);

    return state;
  }

  /* election methods */

  // can be used by an election-eligible follower (election starter)
  // when it loses contact with the leader to start a new election.
  // this transition increments the epoch in advance, clears the known leader,
  // records the self-vote (i.e. the node that started the election votes for itself),
  // and resets the matched sequence progress to the committed sequence.
  async startElection(): Promise<ConsensusState> {
    const state = await this.getConsensusState();
    const electionEpoch = state.currentEpoch + 1n;

    const electionState = await this.repository.startElection({
      expectedEpoch: state.currentEpoch,
      electionEpoch,
      electionStarterMasterNodeId: this.selfMasterNodeId,
      matchedSequence: state.lastCommittedSequence
    });

    verifyElectionStarted(electionState, electionEpoch, this.selfMasterNodeId);

    return electionState;
  }

  // used by a follower that started an election (election starter) after it receives votes from the quorum.
  // this transition promotes the election starter to leader only if the epoch and self-vote still match,
  // then records last leader contact timestamp and resets matched sequence progress to the committed sequence.
  async completeElection(epoch: ConsensusEpoch, electionStarterMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const previousState = await this.getConsensusState();

    await this.repository.claimLeadership({
      leadershipContext: {
        epoch,
        leaderMasterId: electionStarterMasterNodeId
      },
      lastLeaderContactAt: new Date(),
      matchedSequence: previousState.lastCommittedSequence
    });

    const state = await this.getConsensusState();

    verifyElectionCompleted(state, epoch, electionStarterMasterNodeId);

    return state;
  }

  // used when any master node learns that another master node has reached a newer epoch,
  // be it through a vote response or heartbeat response.
  // this transition increments currentEpoch, clears the known leader, vote,
  // leader contact timestamp, and resets matched sequence progress to the committed sequence.
  async adoptNewerEpoch(epoch: ConsensusEpoch): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (epoch <= state.currentEpoch) {
      return state;
    }

    const adoptedState = await this.repository.adoptNewerEpoch({
      epoch,
      matchedSequence: state.lastCommittedSequence
    });

    verifyNewerEpochAdopted(adoptedState, epoch);

    return adoptedState;
  }

  // used when this node receives a vote request from the follower that started an election (election starter).
  // it first compares the election starter's log position from the request with the local log,
  // then atomically applies the Raft voting rules in the repository.
  // if the request epoch is newer, this transition advances the current epoch and clears the known leader and vote.
  // this node votes for the election starter only if its epoch matches the local epoch, its log is up to date,
  // and no different leader or vote is recorded for the local epoch.
  async requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult> {
    return this.repository.applyVoteRequest({
      epoch: input.epoch,
      electionStarterMasterNodeId: input.electionStarterMasterNodeId,
      electionStarterLogIsUpToDate: isElectionStarterLogUpToDate(input)
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
