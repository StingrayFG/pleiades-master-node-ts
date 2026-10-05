import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error.mapper';
import { GenericAbortedError } from '@/errors/application.errors';

import type {
  AdvanceLeadershipLastSequenceRepositoryInput,
  AdvanceLeadershipSequenceRepositoryInput,
  AdvanceSequenceRepositoryInput,
  WithAdvancedLastAllocatedSequenceRepositoryInput,
  AllocatedSequenceTransactionAction,
  WithRewoundLastAllocatedSequenceRepositoryInput,
  RewoundSequenceTransactionAction,
  ClaimLeadershipRepositoryInput,
  AcceptFollowershipRepositoryInput,
  ReleaseLeadershipRepositoryInput,
  StartElectionRepositoryInput,
  AdoptNewerEpochRepositoryInput,
  ApplyVoteRequestRepositoryInput,
  ConsensusVoteResult,
  ConsensusLeadershipContext,
  LeadershipContextTransactionAction
} from './consensus.application';
import { CONSENSUS_STATE_ID, type ConsensusState } from './consensus.domain';
import { mapPrismaConsensusStateToDomainConsensusState } from './consensus.mappers';

/* contract */

type ConsensusStateRepositoryContract = {
  // state
  findState(): Promise<ConsensusState | null>;
  createState(): Promise<ConsensusState>;

  // sequence
  advanceLastCommittedSequence(input: AdvanceLeadershipSequenceRepositoryInput): Promise<ConsensusState>;
  advanceLastAppliedSequence(input: AdvanceSequenceRepositoryInput): Promise<ConsensusState>;
  advanceLastAllocatedSequence(input: AdvanceLeadershipSequenceRepositoryInput): Promise<ConsensusState>;
  advanceLastMatchedSequence(input: AdvanceLeadershipLastSequenceRepositoryInput): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    input: WithAdvancedLastAllocatedSequenceRepositoryInput,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;
  withRewoundLastAllocatedSequence<TResult>(
    input: WithRewoundLastAllocatedSequenceRepositoryInput,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // leadership
  withLeadershipContext<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: LeadershipContextTransactionAction<TResult>
  ): Promise<TResult>;
  claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<boolean>;
  acceptFollowership(input: AcceptFollowershipRepositoryInput): Promise<boolean>;
  releaseLeadership(input: ReleaseLeadershipRepositoryInput): Promise<boolean>;

  // election
  startElection(input: StartElectionRepositoryInput): Promise<ConsensusState>;
  adoptNewerEpoch(input: AdoptNewerEpochRepositoryInput): Promise<ConsensusState>;
  applyVoteRequest(input: ApplyVoteRequestRepositoryInput): Promise<ConsensusVoteResult>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ConsensusStateRepository implements ConsensusStateRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  /* state methods */

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

  async advanceLastCommittedSequence(input: AdvanceLeadershipSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.leadershipContext.epoch,
            leader_master_id: input.leadershipContext.leaderMasterId,

            last_allocated_sequence: {
              gte: input.sequence
            },
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
            id: CONSENSUS_STATE_ID
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async advanceLastAppliedSequence(input: AdvanceSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            last_committed_sequence: {
              gte: input.sequence
            },
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
            id: CONSENSUS_STATE_ID
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async advanceLastAllocatedSequence(input: AdvanceLeadershipSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.leadershipContext.epoch,
            leader_master_id: input.leadershipContext.leaderMasterId,

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
            id: CONSENSUS_STATE_ID
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async advanceLastMatchedSequence(input: AdvanceLeadershipLastSequenceRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.leadershipContext.epoch,
            leader_master_id: input.leadershipContext.leaderMasterId,

            last_allocated_sequence: {
              gte: input.sequence
            },
            last_matched_sequence: {
              lt: input.sequence
            }
          },
          data: {
            last_matched_sequence: input.sequence,

            revision: {
              increment: 1
            }
          }
        });

        return tx.consensusState.findUniqueOrThrow({
          where: {
            id: CONSENSUS_STATE_ID
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async withAdvancedLastAllocatedSequence<TResult>(
    input: WithAdvancedLastAllocatedSequenceRepositoryInput,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.leadershipContext.epoch,
            leader_master_id: input.leadershipContext.leaderMasterId
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
          throw new GenericAbortedError('The write was aborted because cluster leadership changed');
        }

        const state = await tx.consensusState.findUniqueOrThrow({
          where: {
            id: CONSENSUS_STATE_ID
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
    input: WithRewoundLastAllocatedSequenceRepositoryInput,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.leadershipContext.epoch,
            leader_master_id: input.leadershipContext.leaderMasterId,

            last_allocated_sequence: {
              gte: input.sequence
            },
            last_committed_sequence: {
              lte: input.sequence
            }
          },
          data: {
            last_allocated_sequence: input.sequence,

            revision: {
              increment: 1
            }
          }
        });

        if (updated.count !== 1) {
          throw new GenericAbortedError('The sequence rewind was aborted by a concurrent consensus change');
        }

        // reset matched sequence progress if it exceeds the rewind target sequence.
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            last_matched_sequence: {
              gt: input.sequence
            }
          },
          data: {
            last_matched_sequence: input.sequence,

            revision: {
              increment: 1
            }
          }
        });

        return action(tx, input.sequence);
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return result;
  }

  /* leadership methods */

  // fences the action on the caller's leadership: the guarded write only lands
  // while the epoch and leader still match, and a lost fence aborts the whole
  // transaction along with anything the action wrote
  async withLeadershipContext<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: LeadershipContextTransactionAction<TResult>
  ): Promise<TResult> {
    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const guarded = await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: leadershipContext.epoch,
            leader_master_id: leadershipContext.leaderMasterId
          },
          data: {
            revision: {
              increment: 1
            }
          }
        });

        if (guarded.count !== 1) {
          throw new GenericAbortedError('The write was aborted because cluster leadership changed');
        }

        return action(tx);
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return result;
  }

  async claimLeadership(input: ClaimLeadershipRepositoryInput): Promise<boolean> {
    let claimResult;

    try {
      claimResult = await this.prisma.consensusState.updateMany({
        where: {
          id: CONSENSUS_STATE_ID,

          leader_master_id: null,
          OR: [
            {
              current_epoch: {
                lt: input.leadershipContext.epoch
              }
            },
            {
              current_epoch: input.leadershipContext.epoch,
              voted_for_master_id: input.leadershipContext.leaderMasterId
            }
          ]
        },
        data: {
          current_epoch: input.leadershipContext.epoch,
          leader_master_id: input.leadershipContext.leaderMasterId,
          voted_for_master_id: input.leadershipContext.leaderMasterId,
          last_leader_contact_at: input.lastLeaderContactAt,

          last_matched_sequence: input.matchedSequence,

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
          id: CONSENSUS_STATE_ID,

          OR: [
            {
              current_epoch: {
                lt: input.leadershipContext.epoch
              }
            },
            {
              current_epoch: input.leadershipContext.epoch,
              OR: [{ leader_master_id: null }, { leader_master_id: input.leadershipContext.leaderMasterId }]
            }
          ]
        },
        data: {
          current_epoch: input.leadershipContext.epoch,
          leader_master_id: input.leadershipContext.leaderMasterId,
          voted_for_master_id: input.leadershipContext.leaderMasterId,
          last_leader_contact_at: input.lastLeaderContactAt,

          last_matched_sequence: input.matchedSequence,

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

  async releaseLeadership(input: ReleaseLeadershipRepositoryInput): Promise<boolean> {
    let releaseResult;

    try {
      releaseResult = await this.prisma.consensusState.updateMany({
        where: {
          id: CONSENSUS_STATE_ID,

          current_epoch: input.leadershipContext.epoch,
          leader_master_id: input.leadershipContext.leaderMasterId
        },
        data: {
          leader_master_id: null,
          last_leader_contact_at: null,

          last_matched_sequence: input.matchedSequence,

          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return releaseResult.count === 1;
  }

  /* election methods */

  async startElection(input: StartElectionRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.expectedEpoch
          },
          data: {
            current_epoch: input.electionEpoch,
            leader_master_id: null,
            voted_for_master_id: input.electionStarterMasterNodeId,
            last_leader_contact_at: null,

            last_matched_sequence: input.matchedSequence,

            revision: {
              increment: 1
            }
          }
        });

        return tx.consensusState.findUniqueOrThrow({
          where: {
            id: CONSENSUS_STATE_ID
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaConsensusStateToDomainConsensusState(state);
  }

  async adoptNewerEpoch(input: AdoptNewerEpochRepositoryInput): Promise<ConsensusState> {
    let state;

    try {
      state = await this.prisma.$transaction(async (tx) => {
        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: {
              lt: input.epoch
            }
          },
          data: {
            current_epoch: input.epoch,
            leader_master_id: null,
            voted_for_master_id: null,
            last_leader_contact_at: null,

            last_matched_sequence: input.matchedSequence,

            revision: {
              increment: 1
            }
          }
        });

        return tx.consensusState.findUniqueOrThrow({
          where: {
            id: CONSENSUS_STATE_ID
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
            id: CONSENSUS_STATE_ID
          }
        });

        if (input.epoch < state.current_epoch) {
          return { state, voteGranted: false };
        }

        if (input.epoch > state.current_epoch) {
          await tx.consensusState.updateMany({
            where: {
              id: CONSENSUS_STATE_ID,

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
              id: CONSENSUS_STATE_ID
            }
          });
        }

        if (state.current_epoch !== input.epoch || !input.electionStarterLogIsUpToDate) {
          return { state, voteGranted: false };
        }

        if (state.leader_master_id !== null && state.leader_master_id !== input.electionStarterMasterNodeId) {
          return { state, voteGranted: false };
        }

        if (state.voted_for_master_id === input.electionStarterMasterNodeId) {
          return { state, voteGranted: true };
        }

        if (state.voted_for_master_id !== null) {
          return { state, voteGranted: false };
        }

        await tx.consensusState.updateMany({
          where: {
            id: CONSENSUS_STATE_ID,

            current_epoch: input.epoch,
            leader_master_id: null,
            voted_for_master_id: null,

            revision: state.revision
          },
          data: {
            voted_for_master_id: input.electionStarterMasterNodeId,

            revision: {
              increment: 1
            }
          }
        });

        state = await tx.consensusState.findUniqueOrThrow({
          where: {
            id: CONSENSUS_STATE_ID
          }
        });

        return {
          state,
          voteGranted:
            state.current_epoch === input.epoch && state.voted_for_master_id === input.electionStarterMasterNodeId
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
