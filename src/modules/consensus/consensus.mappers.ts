import type { ConsensusState as PrismaConsensusState } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { consensusStateSchema, type ConsensusState } from './consensus.domain';

/* prisma -> domain */

export const mapPrismaConsensusStateToDomainConsensusState = (state: PrismaConsensusState): ConsensusState => {
  return withMapperError('Failed to map Prisma consensus state to domain consensus state', () => {
    return consensusStateSchema.parse({
      id: state.id,

      currentEpoch: state.current_epoch,
      leaderMasterId: state.leader_master_id,
      votedForMasterId: state.voted_for_master_id,
      lastLeaderContactAt: state.last_leader_contact_at,

      lastAllocatedSequence: state.last_allocated_sequence,
      lastMatchedSequence: state.last_matched_sequence,
      lastCommittedSequence: state.last_committed_sequence,
      lastAppliedSequence: state.last_applied_sequence,

      createdAt: state.created_at,
      updatedAt: state.updated_at,

      revision: state.revision
    });
  });
};
