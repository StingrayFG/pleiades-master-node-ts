import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAbortedError } from '@/errors/application.errors';

import type {
  AcceptFollowershipRepositoryInput,
  ApplyVoteRequestRepositoryInput,
  AdvanceLastAllocatedSequenceRepositoryInput,
  AdvanceLastAppliedSequenceRepositoryInput,
  AdvanceLastCommittedSequenceRepositoryInput,
  ConsensusVoteResult,
  ClaimLeadershipRepositoryInput,
  AllocatedSequenceTransactionAction,
  ObserveEpochRepositoryInput,
  RelinquishLeadershipRepositoryInput,
  StartElectionRepositoryInput,
  RewoundSequenceTransactionAction
} from './consensus.application';
import {
  CONSENSUS_STATE_ID,
  type ConsensusEpoch,
  type ConsensusLastSequence,
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
  advanceLastAllocatedSequence(input: AdvanceLastAllocatedSequenceRepositoryInput): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    id: ConsensusStateId,
    epoch: ConsensusEpoch,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;
  withRewoundLastAllocatedSequence<TResult>(
    id: ConsensusStateId,
    epoch: ConsensusEpoch,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // membership
  claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<boolean>;
  acceptFollowership(input: AcceptFollowershipRepositoryInput): Promise<boolean>;
  relinquishLeadership(input: RelinquishLeadershipRepositoryInput): Promise<boolean>;

  // election
  startElection(input: StartElectionRepositoryInput): Promise<ConsensusState>;
  observeEpoch(input: ObserveEpochRepositoryInput): Promise<ConsensusState>;
  applyVoteRequest(input: ApplyVoteRequestRepositoryInput): Promise<ConsensusVoteResult>;
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
            },
            last_allocated_sequence: {
              gte: input.sequence
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

  async advanceLastAllocatedSequence(input: AdvanceLastAllocatedSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            last_allocated_sequence: {
              lt: input.sequence
            }
          },
          data: {
            last_allocated_sequence: input.sequence,
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
            },
            last_committed_sequence: {
              gte: input.sequence
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

  async withRewoundLastAllocatedSequence<TResult>(
    id: ConsensusStateId,
    epoch: ConsensusEpoch,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.consensusState.updateMany({
          where: {
            id,
            current_epoch: epoch,
            last_allocated_sequence: {
              gte: sequence
            },
            last_committed_sequence: {
              lte: sequence
            }
          },
          data: {
            last_allocated_sequence: sequence,
            revision: {
              increment: 1
            }
          }
        });

        if (updated.count !== 1) {
          throw new GenericAbortedError('The sequence rewind was aborted by a concurrent consensus change');
        }

        return action(tx, sequence);
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return result;
  }

  /* membership methods */

  async claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<boolean> {
    let claimResult;

    try {
      claimResult = await this.prisma.consensusState.updateMany({
        where: {
          id: input.id,
          leader_master_id: null,
          OR: [
            {
              current_epoch: {
                lt: input.epoch
              }
            },
            {
              current_epoch: input.epoch,
              voted_for_master_id: input.leaderMasterId
            }
          ]
        },
        data: {
          current_epoch: input.epoch,
          leader_master_id: input.leaderMasterId,
          voted_for_master_id: input.leaderMasterId,
          last_leader_contact_at: input.lastLeaderContactAt,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return claimResult.count === 1;
  }

  async acceptFollowership(input: AcceptFollowershipRepositoryInput): Promise<boolean> {
    let acceptanceResult;

    try {
      acceptanceResult = await this.prisma.consensusState.updateMany({
        where: {
          id: input.id,
          OR: [
            {
              current_epoch: {
                lt: input.epoch
              }
            },
            {
              current_epoch: input.epoch,
              OR: [{ leader_master_id: null }, { leader_master_id: input.leaderMasterId }]
            }
          ]
        },
        data: {
          current_epoch: input.epoch,
          leader_master_id: input.leaderMasterId,
          voted_for_master_id: input.leaderMasterId,
          last_leader_contact_at: input.lastLeaderContactAt,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return acceptanceResult.count === 1;
  }

  async relinquishLeadership(input: RelinquishLeadershipRepositoryInput): Promise<boolean> {
    let relinquishmentResult;

    try {
      relinquishmentResult = await this.prisma.consensusState.updateMany({
        where: {
          id: input.id,
          current_epoch: input.epoch,
          leader_master_id: input.leaderMasterId
        },
        data: {
          leader_master_id: null,
          last_leader_contact_at: null,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return relinquishmentResult.count === 1;
  }

  /* election methods */

  async startElection(input: StartElectionRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            current_epoch: input.expectedEpoch
          },
          data: {
            current_epoch: input.electionEpoch,
            leader_master_id: null,
            voted_for_master_id: input.candidateMasterNodeId,
            last_leader_contact_at: null,
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

  async observeEpoch(input: ObserveEpochRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            current_epoch: {
              lt: input.epoch
            }
          },
          data: {
            current_epoch: input.epoch,
            leader_master_id: null,
            voted_for_master_id: null,
            last_leader_contact_at: null,
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

  async applyVoteRequest(input: ApplyVoteRequestRepositoryInput): Promise<ConsensusVoteResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        let state = await tx.consensusState.findUniqueOrThrow({
          where: {
            id: input.id
          }
        });

        if (input.epoch < state.current_epoch) {
          return { state, voteGranted: false };
        }

        if (input.epoch > state.current_epoch) {
          await tx.consensusState.updateMany({
            where: {
              id: input.id,
              current_epoch: {
                lt: input.epoch
              }
            },
            data: {
              current_epoch: input.epoch,
              leader_master_id: null,
              voted_for_master_id: null,
              last_leader_contact_at: null,
              revision: {
                increment: 1
              }
            }
          });

          state = await tx.consensusState.findUniqueOrThrow({
            where: {
              id: input.id
            }
          });
        }

        if (state.current_epoch !== input.epoch || !input.candidateLogIsUpToDate) {
          return { state, voteGranted: false };
        }

        if (state.leader_master_id !== null && state.leader_master_id !== input.candidateMasterNodeId) {
          return { state, voteGranted: false };
        }

        if (state.voted_for_master_id === input.candidateMasterNodeId) {
          return { state, voteGranted: true };
        }

        if (state.voted_for_master_id !== null) {
          return { state, voteGranted: false };
        }

        await tx.consensusState.updateMany({
          where: {
            id: input.id,
            current_epoch: input.epoch,
            leader_master_id: null,
            voted_for_master_id: null,
            revision: state.revision
          },
          data: {
            voted_for_master_id: input.candidateMasterNodeId,
            revision: {
              increment: 1
            }
          }
        });

        state = await tx.consensusState.findUniqueOrThrow({
          where: {
            id: input.id
          }
        });

        return {
          state,
          voteGranted: state.current_epoch === input.epoch && state.voted_for_master_id === input.candidateMasterNodeId
        };
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return {
      state: mapPrismaConsensusStateToDomainConsensusState(result.state),
      voteGranted: result.voteGranted
    };
  }
}

/* exports */

export { ConsensusStateRepository };
export type { ConsensusStateRepositoryContract };
