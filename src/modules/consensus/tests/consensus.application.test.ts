import { describe, expect, test } from '@jest/globals';

import {
  advanceLastAllocatedSequenceRepositoryInputSchema,
  advanceLastAppliedSequenceRepositoryInputSchema,
  advanceLastCommittedSequenceRepositoryInputSchema,
  advanceLastMatchedSequenceRepositoryInputSchema,
  claimLeadershipRepositoryInputSchema,
  consensusLeadershipContextSchema,
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
    const leadershipFencedInput = {
      ...leadershipContext,
      sequence: 3n
    };
    const matchedSequenceInput = {
      ...leadershipContext,
      sequence: -1n
    };

    expect(consensusLeadershipContextSchema.parse(leadershipContext)).toEqual(leadershipContext);
    expect(advanceLastCommittedSequenceRepositoryInputSchema.parse(leadershipFencedInput)).toEqual(
      leadershipFencedInput
    );
    expect(advanceLastAppliedSequenceRepositoryInputSchema.parse(appliedSequenceInput)).toEqual(appliedSequenceInput);
    expect(advanceLastAllocatedSequenceRepositoryInputSchema.parse(leadershipFencedInput)).toEqual(
      leadershipFencedInput
    );
    expect(advanceLastMatchedSequenceRepositoryInputSchema.parse(leadershipFencedInput)).toEqual(leadershipFencedInput);
    expect(advanceLastMatchedSequenceRepositoryInputSchema.parse(matchedSequenceInput)).toEqual(matchedSequenceInput);
  });

  test('parses leadership claims', () => {
    const input = {
      epoch: 2n,
      leaderMasterId: 'master-node-a',
      lastLeaderContactAt: now,
      matchedSequence: 3n
    };

    expect(claimLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('parses conditional leadership release inputs', () => {
    const input = {
      epoch: 2n,
      leaderMasterId: 'master-node-a',
      matchedSequence: 3n
    };

    expect(releaseLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('rejects negative sequences and epochs', () => {
    expect(() =>
      advanceLastCommittedSequenceRepositoryInputSchema.parse({
        ...leadershipContext,
        sequence: -1n
      })
    ).toThrow();
    expect(() =>
      advanceLastMatchedSequenceRepositoryInputSchema.parse({
        ...leadershipContext,
        sequence: -2n
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        epoch: -1n,
        leaderMasterId: 'master-node-a',
        lastLeaderContactAt: now,
        matchedSequence: 3n
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        epoch: 2n,
        leaderMasterId: 'master-node-a',
        lastLeaderContactAt: now,
        matchedSequence: -2n
      })
    ).toThrow();
  });
});
