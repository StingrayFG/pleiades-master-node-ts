import { describe, expect, test } from '@jest/globals';

import {
  advanceLastAppliedSequenceRepositoryInputSchema,
  advanceLastCommittedSequenceRepositoryInputSchema,
  claimLeadershipRepositoryInputSchema
} from '../consensus.application';
import { CONSENSUS_STATE_ID } from '../consensus.domain';

/* tests */

describe('consensus application schemas', () => {
  test('parses sequence advancement inputs', () => {
    const input = { id: CONSENSUS_STATE_ID, sequence: 3n };

    expect(advanceLastCommittedSequenceRepositoryInputSchema.parse(input)).toEqual(input);
    expect(advanceLastAppliedSequenceRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('parses leadership claims', () => {
    const input = {
      id: CONSENSUS_STATE_ID,
      epoch: 2n,
      leaderMasterId: 'master-node-a'
    };

    expect(claimLeadershipRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('rejects negative sequences and epochs', () => {
    expect(() =>
      advanceLastCommittedSequenceRepositoryInputSchema.parse({ id: CONSENSUS_STATE_ID, sequence: -1n })
    ).toThrow();
    expect(() =>
      claimLeadershipRepositoryInputSchema.parse({
        id: CONSENSUS_STATE_ID,
        epoch: -1n,
        leaderMasterId: 'master-node-a'
      })
    ).toThrow();
  });
});
