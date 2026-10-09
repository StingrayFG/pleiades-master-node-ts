import { describe, expect, test } from '@jest/globals';

import {
  areConsensusVotingConfigurationsEqual,
  hasConsensusVotingQuorum,
  isConsensusVoter,
  isElectionStarterLogUpToDate,
  listConsensusVoterMasterNodeIds,
  resolveConsensusQuorumSequence
} from '../consensus.policies';

/* fixtures */

const masterNodeA = 'master-node-aaaaaaaaaaaa';
const masterNodeB = 'master-node-bbbbbbbbbbbb';
const masterNodeC = 'master-node-cccccccccccc';
const masterNodeD = 'master-node-dddddddddddd';

/* tests */

describe('isElectionStarterLogUpToDate', () => {
  test.each([
    [{ electionStarterLastLogEpoch: 3n, electionStarterLastLogSequence: 1n }, true],
    [{ electionStarterLastLogEpoch: 2n, electionStarterLastLogSequence: 5n }, true],
    [{ electionStarterLastLogEpoch: 2n, electionStarterLastLogSequence: 4n }, true],
    [{ electionStarterLastLogEpoch: 2n, electionStarterLastLogSequence: 3n }, false],
    [{ electionStarterLastLogEpoch: 1n, electionStarterLastLogSequence: 9n }, false]
  ])('compares election starter and local log positions', (positions, expected) => {
    expect(
      isElectionStarterLogUpToDate({
        epoch: 3n,
        electionStarterMasterNodeId: 'master-node-bbbbbbbbbbbb',
        localLastLogEpoch: 2n,
        localLastLogSequence: 4n,
        ...positions
      })
    ).toBe(expected);
  });
});

describe('consensus voting configuration policies', () => {
  test('uses the configured voters for a stable configuration', () => {
    const configuration = {
      phase: 'stable' as const,
      voterMasterNodeIds: [masterNodeA, masterNodeB, masterNodeC]
    };

    expect(listConsensusVoterMasterNodeIds(configuration)).toEqual([masterNodeA, masterNodeB, masterNodeC]);
    expect(isConsensusVoter(configuration, masterNodeB)).toBe(true);
    expect(isConsensusVoter(configuration, masterNodeD)).toBe(false);
    expect(hasConsensusVotingQuorum(configuration, [masterNodeA, masterNodeB])).toBe(true);
    expect(hasConsensusVotingQuorum(configuration, [masterNodeA])).toBe(false);
  });

  test('requires a majority of both voter sets during a joint configuration', () => {
    const configuration = {
      phase: 'joint' as const,
      previousVoterMasterNodeIds: [masterNodeA, masterNodeB, masterNodeC],
      nextVoterMasterNodeIds: [masterNodeB, masterNodeC, masterNodeD]
    };

    expect(listConsensusVoterMasterNodeIds(configuration)).toEqual([
      masterNodeA,
      masterNodeB,
      masterNodeC,
      masterNodeD
    ]);
    expect(hasConsensusVotingQuorum(configuration, [masterNodeA, masterNodeB])).toBe(false);
    expect(hasConsensusVotingQuorum(configuration, [masterNodeB, masterNodeC])).toBe(true);
  });

  test('resolves a joint commit point accepted by both voter-set majorities', () => {
    const configuration = {
      phase: 'joint' as const,
      previousVoterMasterNodeIds: [masterNodeA, masterNodeB, masterNodeC],
      nextVoterMasterNodeIds: [masterNodeB, masterNodeC, masterNodeD]
    };
    const matchedSequences = new Map([
      [masterNodeA, 8n],
      [masterNodeB, 7n],
      [masterNodeC, 5n],
      [masterNodeD, 4n]
    ]);

    expect(resolveConsensusQuorumSequence(configuration, matchedSequences)).toBe(5n);
  });

  test('compares voting configurations as voter sets rather than ordered arrays', () => {
    expect(
      areConsensusVotingConfigurationsEqual(
        { phase: 'stable', voterMasterNodeIds: [masterNodeA, masterNodeB] },
        { phase: 'stable', voterMasterNodeIds: [masterNodeB, masterNodeA] }
      )
    ).toBe(true);
    expect(
      areConsensusVotingConfigurationsEqual(
        { phase: 'stable', voterMasterNodeIds: [masterNodeA, masterNodeB] },
        { phase: 'stable', voterMasterNodeIds: [masterNodeA, masterNodeC] }
      )
    ).toBe(false);
  });
});
