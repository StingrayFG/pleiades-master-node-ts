import { describe, expect, test } from '@jest/globals';

import {
  CONSENSUS_STATE_ID,
  consensusEpochSchema,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  consensusStateSchema
} from '../consensus.domain';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const state = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 0n,
  leaderMasterId: null,
  votedForMasterId: null,
  lastLeaderContactAt: null,

  lastAllocatedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

/* tests */

describe('consensus domain schemas', () => {
  test('accepts the initial unallocated consensus state', () => {
    expect(CONSENSUS_STATE_ID).toBe('self');
    expect(consensusStateSchema.parse(state)).toEqual(state);
  });

  test('accepts nonnegative epochs and allocated sequences', () => {
    expect(consensusEpochSchema.parse(1n)).toBe(1n);
    expect(consensusSequenceSchema.parse(0n)).toBe(0n);
    expect(consensusLastSequenceSchema.parse(-1n)).toBe(-1n);
  });

  test('rejects invalid epochs, sequences, and revisions', () => {
    expect(() => consensusEpochSchema.parse(-1n)).toThrow();
    expect(() => consensusSequenceSchema.parse(-1n)).toThrow();
    expect(() => consensusLastSequenceSchema.parse(-2n)).toThrow();
    expect(() => consensusStateSchema.parse({ ...state, revision: -1n })).toThrow();
  });

  test('rejects consensus sequence ordering violations', () => {
    expect(() =>
      consensusStateSchema.parse({
        ...state,
        lastAllocatedSequence: 1n,
        lastCommittedSequence: 2n
      })
    ).toThrow();
    expect(() =>
      consensusStateSchema.parse({
        ...state,
        lastAllocatedSequence: 2n,
        lastCommittedSequence: 1n,
        lastAppliedSequence: 2n
      })
    ).toThrow();
  });
});
