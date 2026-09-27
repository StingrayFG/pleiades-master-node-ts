import { describe, expect, test } from '@jest/globals';

import { bootstrapResultResponseSchema } from '../bootstrap.http-contracts';

/* tests */

describe('bootstrap HTTP contracts', () => {
  test('accepts an unsigned integer epoch and a leader id', () => {
    const response = {
      role: 'leader',
      epoch: '3',
      leaderMasterId: 'master-node-012345abcdef'
    } as const;

    expect(bootstrapResultResponseSchema.parse(response)).toEqual(response);
  });

  test('rejects malformed epochs and missing leader ids', () => {
    const response = {
      role: 'follower',
      epoch: '3',
      leaderMasterId: 'master-node-012345abcdef'
    } as const;

    expect(bootstrapResultResponseSchema.safeParse({ ...response, epoch: '-1' }).success).toBe(false);
    expect(bootstrapResultResponseSchema.safeParse({ ...response, epoch: 'invalid' }).success).toBe(false);
    expect(bootstrapResultResponseSchema.safeParse({ ...response, leaderMasterId: null }).success).toBe(false);
  });
});
