import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAbortedError } from '@/errors/application.errors';

import type {
  AdvanceLastAppliedSequenceRepositoryInput,
  AdvanceLastCommittedSequenceRepositoryInput,
  ClaimLeadershipRepositoryInput,
  AllocatedSequenceTransactionAction
} from './consensus.application';
import {
  CONSENSUS_STATE_ID,
  type ConsensusEpoch,
  type ConsensusState,
  type ConsensusStateId
} from './consensus.domain';
import { mapPrismaConsensusStateToDomainConsensusState } from './consensus.mappers';

/* contract */

type ConsensusStateRepositoryContract = {
  // state
  findState(): Promise<ConsensusState | null>;
  createState(): Promise<ConsensusState>;

  // sequence
  advanceLastCommittedSequence(input: AdvanceLastCommittedSequenceRepositoryInput): Promise<ConsensusState>;
  advanceLastAppliedSequence(input: AdvanceLastAppliedSequenceRepositoryInput): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    id: ConsensusStateId,
    epoch: ConsensusEpoch,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // membership
  claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<ConsensusState>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ConsensusStateRepository implements ConsensusStateRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  /* consensus methods */

  async findState(): Promise<ConsensusState | null> {
    let state;

    try {
      state = await this.prisma.consensusState.findUnique({
        where: {
          id: CONSENSUS_STATE_ID
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return state ? mapPrismaConsensusStateToDomainConsensusState(state) : null;
  }

  async createState(): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.consensusState.create({
        data: {
          id: CONSENSUS_STATE_ID
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  /* sequence methods */

  async advanceLastCommittedSequence(input: AdvanceLastCommittedSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            last_committed_sequence: {
              lt: input.sequence
            }
          },
          data: {
            last_committed_sequence: input.sequence,
            revision: {
              increment: 1
            }
          }
        });

        return tx.consensusState.findUniqueOrThrow({
          where: {
            id: input.id
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async advanceLastAppliedSequence(input: AdvanceLastAppliedSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            last_applied_sequence: {
              lt: input.sequence
            }
          },
          data: {
            last_applied_sequence: input.sequence,
            revision: {
              increment: 1
            }
          }
        });

        return tx.consensusState.findUniqueOrThrow({
          where: {
            id: input.id
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async withAdvancedLastAllocatedSequence<TResult>(
    id: ConsensusStateId,
    epoch: ConsensusEpoch,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.consensusState.updateMany({
          where: {
            id,
            current_epoch: epoch
          },
          data: {
            last_allocated_sequence: {
              increment: 1
            },
            revision: {
              increment: 1
            }
          }
        });

        if (updated.count !== 1) {
          throw new GenericAbortedError('The write was aborted because the cluster epoch changed');
        }

        const state = await tx.consensusState.findUniqueOrThrow({
          where: {
            id
          }
        });

        return action(tx, state.last_allocated_sequence);
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return result;
  }

  /* membership methods */

  async claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.consensusState.update({
        where: {
          id: input.id
        },
        data: {
          current_epoch: input.epoch,
          leader_master_id: input.leaderMasterId,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }
}

/* exports */

export { ConsensusStateRepository };
export type { ConsensusStateRepositoryContract };
