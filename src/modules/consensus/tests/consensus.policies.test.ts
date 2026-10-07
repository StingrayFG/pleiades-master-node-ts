import { describe, expect, test } from '@jest/globals';

import { isElectionStarterLogUpToDate } from '../consensus.policies';

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
