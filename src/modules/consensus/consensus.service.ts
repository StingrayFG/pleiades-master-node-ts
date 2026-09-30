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
import type { ConsensusStateRepositoryContract } from './consensus.repository';
import {
  isCandidateLogUpToDate,
  verifyAppliedSequenceWithinCommitted,
  verifyCommittedSequenceWithinAllocated,
  verifyElectionCompleted,
  verifyElectionStarted,
  verifyEpochObserved,
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
  advanceLastCommittedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState>;
  advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
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
  startElection(candidateMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  completeElection(epoch: ConsensusEpoch, candidateMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  observeEpoch(epoch: ConsensusEpoch): Promise<ConsensusState>;
  requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult>;
};

/* service */

class ConsensusService implements ConsensusServiceContract {
  constructor(private readonly repository: ConsensusStateRepositoryContract) {}

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

  async claimInitialLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (state.leaderMasterId === selfMasterNodeId) {
      return state;
    }

    if (state.leaderMasterId !== null) {
      return state;
    }

    // the claim only lands when no leader exists, so re-read to return the actual outcome either way
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

  async acceptFollowership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    verifyFollowershipAcceptable(state, leadershipContext);

    // a new leader or epoch invalidates the log verification state; only the committed
    // prefix is known to match, everything beyond it must be verified again
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

  async startElection(candidateMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const state = await this.getConsensusState();
    const electionEpoch = state.currentEpoch + 1n;

    const electionState = await this.repository.startElection({
      expectedEpoch: state.currentEpoch,
      electionEpoch,
      candidateMasterNodeId,
      matchedSequence: state.lastCommittedSequence
    });

    verifyElectionStarted(electionState, electionEpoch, candidateMasterNodeId);

    return electionState;
  }

  async completeElection(epoch: ConsensusEpoch, candidateMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const previousState = await this.getConsensusState();

    await this.repository.claimLeadership({
      leadershipContext: {
        epoch,
        leaderMasterId: candidateMasterNodeId
      },
      lastLeaderContactAt: new Date(),
      matchedSequence: previousState.lastCommittedSequence
    });

    const state = await this.getConsensusState();

    verifyElectionCompleted(state, epoch, candidateMasterNodeId);

    return state;
  }

  async observeEpoch(epoch: ConsensusEpoch): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (epoch <= state.currentEpoch) {
      return state;
    }

    const observedState = await this.repository.observeEpoch({
      epoch,
      matchedSequence: state.lastCommittedSequence
    });

    verifyEpochObserved(observedState, epoch);

    return observedState;
  }

  async requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult> {
    return this.repository.applyVoteRequest({
      epoch: input.epoch,
      candidateMasterNodeId: input.candidateMasterNodeId,
      candidateLogIsUpToDate: isCandidateLogUpToDate(input)
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
