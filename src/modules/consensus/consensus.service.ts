import {
  GenericAbortedError,
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError
} from '@/errors/application.errors';
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
  bootstrapLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  acceptFollowership(leaderMasterId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState>;
  relinquishLeadership(leaderMasterId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState>;

  // election
  startElection(candidateMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  completeElection(candidateMasterNodeId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState>;
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

    if (sequence > state.lastAllocatedSequence) {
      throw new GenericFailedPreconditionError(
        'Cannot advance the committed sequence beyond the last allocated sequence'
      );
    }

    const updatedState = await this.repository.advanceLastCommittedSequence({
      epoch: leadershipContext.epoch,
      leaderMasterId: leadershipContext.leaderMasterId,

      sequence
    });

    if (
      updatedState.currentEpoch !== leadershipContext.epoch ||
      updatedState.leaderMasterId !== leadershipContext.leaderMasterId ||
      updatedState.lastCommittedSequence < sequence
    ) {
      throw new GenericAbortedError('Committed sequence advancement was aborted by a concurrent consensus change');
    }

    return updatedState;
  }

  async advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (sequence > state.lastCommittedSequence) {
      throw new GenericFailedPreconditionError(
        'Cannot advance the applied sequence beyond the last committed sequence'
      );
    }

    const updatedState = await this.repository.advanceLastAppliedSequence({
      sequence
    });

    if (updatedState.lastAppliedSequence < sequence) {
      throw new GenericAbortedError('Applied sequence advancement was aborted by a concurrent consensus change');
    }

    return updatedState;
  }

  async advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    await this.getConsensusState();

    const updatedState = await this.repository.advanceLastAllocatedSequence({
      epoch: leadershipContext.epoch,
      leaderMasterId: leadershipContext.leaderMasterId,

      sequence
    });

    if (
      updatedState.currentEpoch !== leadershipContext.epoch ||
      updatedState.leaderMasterId !== leadershipContext.leaderMasterId ||
      updatedState.lastAllocatedSequence < sequence
    ) {
      throw new GenericAbortedError('Allocated sequence advancement was aborted by a concurrent consensus change');
    }

    return updatedState;
  }

  async advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (sequence > state.lastAllocatedSequence) {
      throw new GenericFailedPreconditionError('Cannot advance the matched sequence beyond the last allocated sequence');
    }

    const updatedState = await this.repository.advanceLastMatchedSequence({
      epoch: leadershipContext.epoch,
      leaderMasterId: leadershipContext.leaderMasterId,

      sequence
    });

    if (
      updatedState.currentEpoch !== leadershipContext.epoch ||
      updatedState.leaderMasterId !== leadershipContext.leaderMasterId ||
      updatedState.lastMatchedSequence < sequence
    ) {
      throw new GenericAbortedError('Matched sequence advancement was aborted by a concurrent consensus change');
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
        epoch: leadershipContext.epoch,
        leaderMasterId: leadershipContext.leaderMasterId
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

    if (sequence < state.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('Cannot rewind the allocated sequence below the committed sequence');
    }

    if (sequence > state.lastAllocatedSequence) {
      throw new GenericFailedPreconditionError('The rewound sequence cannot exceed the last allocated sequence');
    }

    return this.repository.withRewoundLastAllocatedSequence(
      {
        epoch: leadershipContext.epoch,
        leaderMasterId: leadershipContext.leaderMasterId,
        sequence
      },
      action
    );
  }

  /* leadership methods */

  async bootstrapLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (state.leaderMasterId === selfMasterNodeId) {
      return state;
    }

    if (state.leaderMasterId !== null) {
      return state;
    }

    // the claim only lands when no leader exists, so re-read to return the actual outcome either way
    await this.repository.claimLeadership({
      epoch: state.currentEpoch + 1n,
      leaderMasterId: selfMasterNodeId,
      lastLeaderContactAt: new Date(),
      matchedSequence: state.lastCommittedSequence
    });

    return this.getConsensusState();
  }

  async acceptFollowership(leaderMasterId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (state.currentEpoch === epoch && state.leaderMasterId !== null && state.leaderMasterId !== leaderMasterId) {
      throw new GenericConflictError('This master node already belongs to a different leader');
    }

    if (state.currentEpoch > epoch) {
      throw new GenericConflictError('The leader epoch is older than the local consensus epoch');
    }

    // a new leader or epoch invalidates the log verification state; only the committed
    // prefix is known to match, everything beyond it must be verified again
    const matchedSequence =
      state.currentEpoch !== epoch || state.leaderMasterId !== leaderMasterId
        ? state.lastCommittedSequence
        : state.lastMatchedSequence;

    await this.repository.acceptFollowership({
      epoch,
      leaderMasterId,
      lastLeaderContactAt: new Date(),
      matchedSequence
    });

    const followerState = await this.getConsensusState();

    if (followerState.leaderMasterId !== leaderMasterId || followerState.currentEpoch < epoch) {
      throw new GenericConflictError('Another master node was accepted as the cluster leader first');
    }

    return followerState;
  }

  async relinquishLeadership(leaderMasterId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState> {
    const previousState = await this.getConsensusState();

    await this.repository.relinquishLeadership({
      epoch,
      leaderMasterId,
      matchedSequence: previousState.lastCommittedSequence
    });

    const state = await this.getConsensusState();

    if (state.currentEpoch === epoch && state.leaderMasterId === leaderMasterId) {
      throw new GenericAbortedError('Leadership relinquishment was aborted by a concurrent consensus change');
    }

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

    if (
      electionState.currentEpoch !== electionEpoch ||
      electionState.leaderMasterId !== null ||
      electionState.votedForMasterId !== candidateMasterNodeId
    ) {
      throw new GenericAbortedError('Election start was aborted by a concurrent consensus change');
    }

    return electionState;
  }

  async completeElection(candidateMasterNodeId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState> {
    const previousState = await this.getConsensusState();

    await this.repository.claimLeadership({
      epoch,
      leaderMasterId: candidateMasterNodeId,
      lastLeaderContactAt: new Date(),
      matchedSequence: previousState.lastCommittedSequence
    });

    const state = await this.getConsensusState();

    if (state.currentEpoch !== epoch || state.leaderMasterId !== candidateMasterNodeId) {
      throw new GenericAbortedError('Election completion was aborted by a concurrent consensus change');
    }

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

    if (observedState.currentEpoch < epoch) {
      throw new GenericAbortedError('Epoch observation was aborted by a concurrent consensus change');
    }

    return observedState;
  }

  async requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult> {
    const candidateLogIsUpToDate =
      input.candidateLastLogEpoch > input.localLastLogEpoch ||
      (input.candidateLastLogEpoch === input.localLastLogEpoch &&
        input.candidateLastLogSequence >= input.localLastLogSequence);

    return this.repository.applyVoteRequest({
      epoch: input.epoch,
      candidateMasterNodeId: input.candidateMasterNodeId,
      candidateLogIsUpToDate
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
