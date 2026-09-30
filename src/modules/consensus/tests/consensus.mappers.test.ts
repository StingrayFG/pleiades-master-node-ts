import type { ConsensusState as PrismaConsensusState } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import { CONSENSUS_STATE_ID, type ConsensusState } from '../consensus.domain';
import { mapPrismaConsensusStateToDomainConsensusState } from '../consensus.mappers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaState: PrismaConsensusState = {
  id: CONSENSUS_STATE_ID,
  current_epoch: 2n,
  leader_master_id: 'master-node-aaaaaaaaaaaa',
  voted_for_master_id: 'master-node-aaaaaaaaaaaa',
  last_leader_contact_at: now,

  last_allocated_sequence: 4n,
  last_matched_sequence: 3n,
  last_committed_sequence: 3n,
  last_applied_sequence: 2n,
  created_at: now,
  updated_at: now,
  revision: 5n
};

const state: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-aaaaaaaaaaaa',
  votedForMasterId: 'master-node-aaaaaaaaaaaa',
  lastLeaderContactAt: now,

  lastAllocatedSequence: 4n,
  lastMatchedSequence: 3n,
  lastCommittedSequence: 3n,
  lastAppliedSequence: 2n,
  createdAt: now,
  updatedAt: now,
  revision: 5n
};

/* tests */

describe('consensus mappers', () => {
  test('maps a Prisma consensus state to the domain model', () => {
    expect(mapPrismaConsensusStateToDomainConsensusState(prismaState)).toEqual(state);
  });

  test('wraps invalid Prisma rows in mapper errors', () => {
    expect(() =>
      mapPrismaConsensusStateToDomainConsensusState({
        ...prismaState,
        last_allocated_sequence: -2n
      })
    ).toThrow(GenericMapperError);
  });

  test('rejects contradictory persisted leadership state', () => {
    expect(() =>
      mapPrismaConsensusStateToDomainConsensusState({
        ...prismaState,
        voted_for_master_id: 'master-node-bbbbbbbbbbbb'
      })
    ).toThrow(GenericMapperError);
  });
});
