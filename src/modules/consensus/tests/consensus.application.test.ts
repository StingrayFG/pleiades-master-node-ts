import { describe, expect, test } from '@jest/globals';

import {
  advanceLastAllocatedSequenceRepositoryInputSchema,
  advanceLastAppliedSequenceRepositoryInputSchema,
  advanceLastCommittedSequenceRepositoryInputSchema,
  advanceLastMatchedSequenceRepositoryInputSchema,
  claimLeadershipRepositoryInputSchema,
  consensusLeadershipContextSchema,
  relinquishLeadershipRepositoryInputSchema
} from '../consensus.application';
import { CONSENSUS_STATE_ID } from '../consensus.domain';

/* tests */

describe('consensus application schemas', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const leadershipContext = {
    epoch: 2n,
    leaderMasterId: 'master-node-a'
  };

  test('parses sequence advancement inputs', () => {
    const appliedSequenceInput = { id: CONSENSUS_STATE_ID, sequence: 3n };
    const leadershipFencedInput = {
      id: CONSENSUS_STATE_ID,
      ...leadershipContext,
      sequence: 3n
    };
    const matchedSequenceInput = {
      id: CONSENSUS_STATE_ID,
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
      id: CONSENSUS_STATE_ID,
      epoch: 2n,
      leaderMasterId: 'master-node-a',
      lastLeaderContactAt: now,
      matchedSequence: 3n
    };

    expect(claimLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('parses conditional leadership relinquishment inputs', () => {
    const input = {
      id: CONSENSUS_STATE_ID,
      epoch: 2n,
      leaderMasterId: 'master-node-a',
      matchedSequence: 3n
    };

    expect(relinquishLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('rejects negative sequences and epochs', () => {
    expect(() =>
      advanceLastCommittedSequenceRepositoryInputSchema.parse({
        id: CONSENSUS_STATE_ID,
        ...leadershipContext,
        sequence: -1n
      })
    ).toThrow();
    expect(() =>
      advanceLastMatchedSequenceRepositoryInputSchema.parse({
        id: CONSENSUS_STATE_ID,
        ...leadershipContext,
        sequence: -2n
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        id: CONSENSUS_STATE_ID,
        epoch: -1n,
        leaderMasterId: 'master-node-a',
        lastLeaderContactAt: now,
        matchedSequence: 3n
      })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        id: CONSENSUS_STATE_ID,
        epoch: 2n,
        leaderMasterId: 'master-node-a',
        lastLeaderContactAt: now,
        matchedSequence: -2n
      })
    ).toThrow();
  });
});
