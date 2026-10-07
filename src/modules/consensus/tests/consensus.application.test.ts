import { describe, expect, test } from '@jest/globals';

import {
  advanceSequenceRepositoryInputSchema,
  acceptFollowershipRepositoryInputSchema,
  claimLeadershipRepositoryInputSchema,
  consensusVoteResultSchema,
  releaseLeadershipRepositoryInputSchema
} from '../consensus.application';

/* tests */

describe('consensus application schemas', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const leadershipContext = {
    epoch: 2n,
    leaderMasterId: 'master-node-aaaaaaaaaaaa'
  };

  test('parses sequence advancement inputs', () => {
    const appliedSequenceInput = { sequence: 3n };

    expect(advanceSequenceRepositoryInputSchema.parse(appliedSequenceInput)).toEqual(appliedSequenceInput);
  });

  test('parses leadership claims', () => {
    const input = {
      leadershipContext,
      lastLeaderContactAt: now,
      matchedSequence: 3n
    };

    expect(claimLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
    expect(acceptFollowershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('parses conditional leadership release inputs', () => {
    const input = {
      leadershipContext,
      matchedSequence: 3n
    };

    expect(releaseLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('parses consensus vote results', () => {
    const result = {
      state: {
        id: 'self',
        currentEpoch: 2n,
        leaderMasterId: 'master-node-aaaaaaaaaaaa',
        votedForMasterId: 'master-node-aaaaaaaaaaaa',
        lastLeaderContactAt: now,
        lastAllocatedSequence: 3n,
        lastMatchedSequence: 3n,
        lastCommittedSequence: 3n,
        lastAppliedSequence: 3n,
        createdAt: now,
        updatedAt: now,
        revision: 1n
      },
      voteGranted: true
    };

    expect(consensusVoteResultSchema.parse(result)).toEqual(result);
    expect(() => consensusVoteResultSchema.parse({ ...result, voteGranted: 'true' })).toThrow();
  });

  test('rejects negative sequences and epochs', () => {
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        leadershipContext: {
          epoch: -1n,
          leaderMasterId: 'master-node-aaaaaaaaaaaa'
        },
        lastLeaderContactAt: now,
        matchedSequence: 3n
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        leadershipContext,
        lastLeaderContactAt: now,
        matchedSequence: -2n
      })
    ).toThrow();
  });
});
