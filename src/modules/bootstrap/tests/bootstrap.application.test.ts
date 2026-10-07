import { describe, expect, test } from '@jest/globals';

import { bootstrapAsFollowerInputSchema, masterBootstrapResultSchema } from '../bootstrap.application';

/* fixtures */

const leaderMasterId = 'master-node-aaaaaaaaaaaa';

const followerInput = {
  leaderEndpoint: {
    hostname: 'master-node.internal',
    port: 4410,
    scheme: 'grpcs'
  },
  leaderCertificateFingerprint: 'ab'.repeat(32)
} as const;

/* tests */

describe('bootstrap application schemas', () => {
  test('accepts a secure follower bootstrap input', () => {
    expect(bootstrapAsFollowerInputSchema.parse(followerInput)).toEqual(followerInput);
  });

  test('rejects an insecure follower bootstrap endpoint', () => {
    expect(
      bootstrapAsFollowerInputSchema.safeParse({
        ...followerInput,
        leaderEndpoint: {
          ...followerInput.leaderEndpoint,
          scheme: 'grpc'
        }
      }).success
    ).toBe(false);
  });

  test('requires a leader id in successful bootstrap results', () => {
    const result = {
      role: 'follower',
      epoch: 3n,
      leaderMasterId
    } as const;

    expect(masterBootstrapResultSchema.parse(result)).toEqual(result);
    expect(
      masterBootstrapResultSchema.safeParse({
        ...result,
        leaderMasterId: null
      }).success
    ).toBe(false);
  });
});
