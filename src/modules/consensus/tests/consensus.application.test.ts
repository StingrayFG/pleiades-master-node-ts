import { describe, expect, test } from '@jest/globals';

import {
  advanceLeadershipLastSequenceRepositoryInputSchema,
  advanceLeadershipSequenceRepositoryInputSchema,
  advanceSequenceRepositoryInputSchema,
  acceptFollowershipRepositoryInputSchema,
  claimLeadershipRepositoryInputSchema,
  consensusLeadershipContextSchema,
  consensusVoteResultSchema,
  releaseLeadershipRepositoryInputSchema
} from '../consensus.application';

/* tests */

describe('consensus application schemas', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const leadershipContext = {
    epoch: 2n,
    leaderMasterId: 'master-node-a'
  };

  test('parses sequence advancement inputs', () => {
    const appliedSequenceInput = { sequence: 3n };
    const leadershipSequenceInput = {
      sequence: 3n,
      leadershipContext
    };
    const leadershipLastSequenceInput = {
      sequence: -1n,
      leadershipContext
    };

    expect(consensusLeadershipContextSchema.parse(leadershipContext)).toEqual(leadershipContext);
    expect(advanceSequenceRepositoryInputSchema.parse(appliedSequenceInput)).toEqual(appliedSequenceInput);
    expect(advanceLeadershipSequenceRepositoryInputSchema.parse(leadershipSequenceInput)).toEqual(
      leadershipSequenceInput
    );
    expect(advanceLeadershipLastSequenceRepositoryInputSchema.parse(leadershipSequenceInput)).toEqual(
      leadershipSequenceInput
    );
    expect(advanceLeadershipLastSequenceRepositoryInputSchema.parse(leadershipLastSequenceInput)).toEqual(
      leadershipLastSequenceInput
    );
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
        leaderMasterId: 'master-node-a',
        votedForMasterId: 'master-node-a',
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
      advanceLeadershipSequenceRepositoryInputSchema.parse({
        sequence: -1n,
        leadershipContext
      })
    ).toThrow();
    expect(() =>
      advanceLeadershipLastSequenceRepositoryInputSchema.parse({
        sequence: -2n,
        leadershipContext
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        leadershipContext: {
          epoch: -1n,
          leaderMasterId: 'master-node-a'
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
