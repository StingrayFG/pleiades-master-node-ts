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
import {
  CONSENSUS_STATE_ID,
  type ConsensusEpoch,
  type ConsensusLastSequence,
  type ConsensusState
} from './consensus.domain';
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
      id: CONSENSUS_STATE_ID,

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
      id: CONSENSUS_STATE_ID,
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
      id: CONSENSUS_STATE_ID,

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

  async withAdvancedLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    await this.getConsensusState();

    return this.repository.withAdvancedLastAllocatedSequence(
      CONSENSUS_STATE_ID,
      leadershipContext.epoch,
      leadershipContext.leaderMasterId,
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
      CONSENSUS_STATE_ID,
      leadershipContext.epoch,
      leadershipContext.leaderMasterId,
      sequence,
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
      id: CONSENSUS_STATE_ID,
      epoch: state.currentEpoch + 1n,
      leaderMasterId: selfMasterNodeId,
      lastLeaderContactAt: new Date()
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

    await this.repository.acceptFollowership({
      id: CONSENSUS_STATE_ID,
      epoch,
      leaderMasterId,
      lastLeaderContactAt: new Date()
    });

    const followerState = await this.getConsensusState();

    if (followerState.leaderMasterId !== leaderMasterId || followerState.currentEpoch < epoch) {
      throw new GenericConflictError('Another master node was accepted as the cluster leader first');
    }

    return followerState;
  }

  async relinquishLeadership(leaderMasterId: MasterNodeId, epoch: ConsensusEpoch): Promise<ConsensusState> {
    await this.getConsensusState();

    await this.repository.relinquishLeadership({
      id: CONSENSUS_STATE_ID,
      epoch,
      leaderMasterId
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
      id: CONSENSUS_STATE_ID,
      expectedEpoch: state.currentEpoch,
      electionEpoch,
      candidateMasterNodeId
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
    await this.repository.claimLeadership({
      id: CONSENSUS_STATE_ID,
      epoch,
      leaderMasterId: candidateMasterNodeId,
      lastLeaderContactAt: new Date()
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
      id: CONSENSUS_STATE_ID,
      epoch
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
      id: CONSENSUS_STATE_ID,
      epoch: input.epoch,
      candidateMasterNodeId: input.candidateMasterNodeId,
      candidateLogIsUpToDate
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
