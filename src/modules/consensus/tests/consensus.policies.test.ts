import { describe, expect, test } from '@jest/globals';

import { isCandidateLogUpToDate } from '../consensus.policies';

/* tests */

describe('isCandidateLogUpToDate', () => {
  test.each([
    [{ candidateLastLogEpoch: 3n, candidateLastLogSequence: 1n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 5n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 4n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 3n }, false],
    [{ candidateLastLogEpoch: 1n, candidateLastLogSequence: 9n }, false]
  ])('compares candidate and local log positions', (positions, expected) => {
    expect(
      isCandidateLogUpToDate({
        epoch: 3n,
        candidateMasterNodeId: 'master-node-b',
        localLastLogEpoch: 2n,
        localLastLogSequence: 4n,
        ...positions
      })
    ).toBe(expected);
  });
});
