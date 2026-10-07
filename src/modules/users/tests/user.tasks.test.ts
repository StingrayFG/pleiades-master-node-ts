import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';

import {
  createUserApiKeyTaskDefinition,
  createUserRefreshTokenTaskDefinition,
  createUserTaskDefinition,
  revokeUserApiKeyTaskDefinition,
  revokeUserRefreshTokenTaskDefinition,
  rotateUserRefreshTokenTaskDefinition,
  userTaskSchema
} from '../user.tasks';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
const refreshTokenId = '00000000-0000-4000-8000-000000000003';
const newRefreshTokenId = '00000000-0000-4000-8000-000000000004';
const expiresAt = new Date('2026-02-01T00:00:00.000Z');

const taskBase = {
  id: '00000000-0000-4000-8000-000000000099',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 1n,
  sequence: 2n,
  state: 'pending' as const,
  revision: 0n,
  executionScope: 'cluster' as const
};

/* tests */

describe('user task definitions', () => {
  test.each([
    createUserTaskDefinition,
    createUserApiKeyTaskDefinition,
    revokeUserApiKeyTaskDefinition,
    createUserRefreshTokenTaskDefinition,
    rotateUserRefreshTokenTaskDefinition,
    revokeUserRefreshTokenTaskDefinition
  ])('uses cluster execution for $type', (definition) => {
    expect(definition.executionScope).toBe('cluster');
  });

  test('parses every user task variant', () => {
    const tasks = [
      {
        ...taskBase,
        type: 'user.create',
        data: { userId, username: 'test-user', passwordHash: 'password-hash' }
      },
      {
        ...taskBase,
        type: 'user.api-key.create',
        data: { apiKeyId, userId, secretHash: 'secret-hash', name: 'test key', expiresAt: expiresAt.toISOString() }
      },
      {
        ...taskBase,
        type: 'user.api-key.revoke',
        data: { userId, apiKeyId }
      },
      {
        ...taskBase,
        type: 'user.refresh-token.create',
        data: { refreshTokenId, userId, secretHash: 'secret-hash', expiresAt: expiresAt.toISOString() }
      },
      {
        ...taskBase,
        type: 'user.refresh-token.rotate',
        data: {
          currentRefreshTokenId: refreshTokenId,
          newRefreshTokenId,
          userId,
          secretHash: 'secret-hash',
          expiresAt: expiresAt.toISOString()
        }
      },
      {
        ...taskBase,
        type: 'user.refresh-token.revoke',
        data: { refreshTokenId }
      }
    ];

    for (const task of tasks) {
      expect(userTaskSchema.safeParse(task).success).toBe(true);
    }
  });

  test('encodes and decodes task dates', () => {
    const data = {
      apiKeyId,
      userId,
      secretHash: 'secret-hash',
      name: 'test key',
      expiresAt
    };

    const encoded = z.encode(createUserApiKeyTaskDefinition.persistedDataSchema, data);

    expect(encoded).toMatchObject({ expiresAt: expiresAt.toISOString() });
    expect(z.decode(createUserApiKeyTaskDefinition.persistedDataSchema, encoded)).toEqual(data);
  });

  test('rejects an unknown user task type', () => {
    expect(
      userTaskSchema.safeParse({
        ...taskBase,
        type: 'user.unknown',
        data: {}
      }).success
    ).toBe(false);
  });
});
