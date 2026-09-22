import { describe, expect, test } from '@jest/globals';

import { userApiKeySchema, userRefreshTokenSchema, userSchema, userUsernameSchema } from '../user.domain';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-01-01T00:00:00.000Z');

/* tests */

describe('user domain schemas', () => {
  test('accepts valid user entities', () => {
    expect(
      userSchema.parse({
        id: userId,
        username: 'test-user',
        state: 'active',
        createdAt: now,
        updatedAt: now
      })
    ).toBeDefined();

    expect(
      userApiKeySchema.parse({
        id: '00000000-0000-4000-8000-000000000002',
        userId,
        state: 'active',
        name: 'test key',
        createdAt: now,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null
      })
    ).toBeDefined();

    expect(
      userRefreshTokenSchema.parse({
        id: '00000000-0000-4000-8000-000000000003',
        userId,
        state: 'active',
        createdAt: now,
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        revokedAt: null
      })
    ).toBeDefined();
  });

  test.each(['ab', 'a'.repeat(65)])('rejects username %j outside the length limits', (username) => {
    expect(userUsernameSchema.safeParse(username).success).toBe(false);
  });

  test('rejects invalid entity ids', () => {
    expect(
      userSchema.safeParse({
        id: 'not-a-uuid',
        username: 'test-user',
        state: 'active',
        createdAt: now,
        updatedAt: now
      }).success
    ).toBe(false);
  });

  test('rejects unsupported lifecycle states', () => {
    expect(
      userApiKeySchema.safeParse({
        id: '00000000-0000-4000-8000-000000000002',
        userId,
        state: 'disabled',
        name: 'test key',
        createdAt: now,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null
      }).success
    ).toBe(false);
  });
});
