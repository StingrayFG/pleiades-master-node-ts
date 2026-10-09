import { describe, expect, test } from '@jest/globals';

import {
  CONSENSUS_STATE_ID,
  consensusEpochSchema,
  consensusLeadershipContextSchema,
  consensusLeadershipContextWithLastSequenceSchema,
  consensusLeadershipContextWithSequenceSchema,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  consensusStateSchema,
  consensusVotingConfigurationSchema
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
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

/* tests */

describe('consensus domain schemas', () => {
  test('parses leadership context with sequence variants', () => {
    const leadershipContext = {
      epoch: 2n,
      leaderMasterId: 'master-node-aaaaaaaaaaaa'
    };

    expect(consensusLeadershipContextSchema.parse(leadershipContext)).toEqual(leadershipContext);
    expect(
      consensusLeadershipContextWithSequenceSchema.parse({
        leadershipContext,
        sequence: 0n
      })
    ).toEqual({ leadershipContext, sequence: 0n });
    expect(
      consensusLeadershipContextWithLastSequenceSchema.parse({
        leadershipContext,
        sequence: -1n
      })
    ).toEqual({ leadershipContext, sequence: -1n });
    expect(() =>
      consensusLeadershipContextWithSequenceSchema.parse({
        leadershipContext,
        sequence: -1n
      })
    ).toThrow();
    expect(() =>
      consensusLeadershipContextWithLastSequenceSchema.parse({
        leadershipContext,
        sequence: -2n
      })
    ).toThrow();
  });

  test('accepts the initial unallocated consensus state', () => {
    expect(CONSENSUS_STATE_ID).toBe('self');
    expect(consensusStateSchema.parse(state)).toEqual(state);
  });

  test('accepts nonnegative epochs and allocated sequences', () => {
    expect(consensusEpochSchema.parse(1n)).toBe(1n);
    expect(consensusSequenceSchema.parse(0n)).toBe(0n);
    expect(consensusLastSequenceSchema.parse(-1n)).toBe(-1n);
  });

  test('accepts stable and joint voting configurations with unique voters', () => {
    expect(
      consensusVotingConfigurationSchema.parse({
        phase: 'stable',
        voterMasterNodeIds: ['master-node-aaaaaaaaaaaa']
      })
    ).toEqual({
      phase: 'stable',
      voterMasterNodeIds: ['master-node-aaaaaaaaaaaa']
    });
    expect(
      consensusVotingConfigurationSchema.parse({
        phase: 'joint',
        previousVoterMasterNodeIds: ['master-node-aaaaaaaaaaaa'],
        nextVoterMasterNodeIds: ['master-node-aaaaaaaaaaaa', 'master-node-bbbbbbbbbbbb']
      })
    ).toEqual({
      phase: 'joint',
      previousVoterMasterNodeIds: ['master-node-aaaaaaaaaaaa'],
      nextVoterMasterNodeIds: ['master-node-aaaaaaaaaaaa', 'master-node-bbbbbbbbbbbb']
    });
  });

  test('rejects empty or duplicate voting configurations', () => {
    expect(() =>
      consensusVotingConfigurationSchema.parse({
        phase: 'stable',
        voterMasterNodeIds: []
      })
    ).toThrow();
    expect(() =>
      consensusVotingConfigurationSchema.parse({
        phase: 'stable',
        voterMasterNodeIds: ['master-node-aaaaaaaaaaaa', 'master-node-aaaaaaaaaaaa']
      })
    ).toThrow();
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
        lastAllocatedSequence: 1n,
        lastMatchedSequence: 2n
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

  test('rejects a leader that does not match the vote recorded for the epoch', () => {
    expect(() =>
      consensusStateSchema.parse({
        ...state,
        leaderMasterId: 'master-node-aaaaaaaaaaaa',
        votedForMasterId: 'master-node-bbbbbbbbbbbb',
        lastLeaderContactAt: now
      })
    ).toThrow();
  });

  test('requires leader identity and contact time to be present together', () => {
    expect(() =>
      consensusStateSchema.parse({
        ...state,
        leaderMasterId: 'master-node-aaaaaaaaaaaa',
        votedForMasterId: 'master-node-aaaaaaaaaaaa'
      })
    ).toThrow();
    expect(() =>
      consensusStateSchema.parse({
        ...state,
        lastLeaderContactAt: now
      })
    ).toThrow();
  });
});
