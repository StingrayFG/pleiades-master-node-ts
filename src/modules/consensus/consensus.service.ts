import { GenericAlreadyExistsError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { TaskSequence } from '@/modules/tasks/task.domain';

import type { AllocatedSequenceTransactionAction } from './consensus.application';
import { CONSENSUS_STATE_ID, type ConsensusEpoch, type ConsensusState } from './consensus.domain';
import type { ConsensusStateRepositoryContract } from './consensus.repository';

/* contract */

type ConsensusServiceContract = {
  // state
  getConsensusState(): Promise<ConsensusState>;

  // sequence
  advanceLastCommittedSequence(sequence: TaskSequence): Promise<ConsensusState>;
  advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    epoch: ConsensusEpoch,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // membership
  bootstrapLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState>;
};

/* service */

class ConsensusService implements ConsensusServiceContract {
  constructor(private readonly repository: ConsensusStateRepositoryContract) {}

  /* consensus methods */

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

  async advanceLastCommittedSequence(sequence: TaskSequence): Promise<ConsensusState> {
    await this.getConsensusState();

    return this.repository.advanceLastCommittedSequence({
      id: CONSENSUS_STATE_ID,
      sequence
    });
  }

  async advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (sequence > state.lastCommittedSequence) {
      throw new GenericFailedPreconditionError(
        'Cannot advance the applied sequence beyond the last committed sequence'
      );
    }

    return this.repository.advanceLastAppliedSequence({
      id: CONSENSUS_STATE_ID,
      sequence
    });
  }

  async withAdvancedLastAllocatedSequence<TResult>(
    epoch: ConsensusEpoch,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    await this.getConsensusState();

    return this.repository.withAdvancedLastAllocatedSequence(CONSENSUS_STATE_ID, epoch, action);
  }

  /* membership methods */

  async bootstrapLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const state = await this.getConsensusState();

    if (state.leaderMasterId === selfMasterNodeId) {
      return state;
    }

    if (state.leaderMasterId !== null) {
      return state;
    }

    return this.repository.claimLeadership({
      id: CONSENSUS_STATE_ID,
      epoch: state.currentEpoch + 1n,
      leaderMasterId: selfMasterNodeId
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
