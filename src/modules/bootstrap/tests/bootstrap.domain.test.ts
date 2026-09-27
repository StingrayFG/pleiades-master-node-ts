import { describe, expect, test } from '@jest/globals';

import { MASTER_BOOTSTRAP_ROLES, masterBootstrapRoleSchema } from '../bootstrap.domain';

/* tests */

describe('bootstrap domain schemas', () => {
  test('accepts every supported bootstrap role', () => {
    expect(MASTER_BOOTSTRAP_ROLES.map((role) => masterBootstrapRoleSchema.parse(role))).toEqual(['leader', 'follower']);
  });

  test('rejects unsupported bootstrap roles', () => {
    expect(masterBootstrapRoleSchema.safeParse('candidate').success).toBe(false);
  });
});
