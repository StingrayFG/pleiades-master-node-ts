import type {
  User as PrismaUser,
  UserApiKey as PrismaUserApiKey,
  UserRefreshToken as PrismaUserRefreshToken
} from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { User, UserApiKey, UserRefreshToken } from '../user.domain';
import {
  mapCreateApiKeyResultToHttpCreateApiKeyResponse,
  mapDomainUserApiKeyToHttpUserApiKeyResponse,
  mapDomainUserApiKeysToHttpListApiKeysResponse,
  mapDomainUserToHttpUserResponse,
  mapPrismaUserApiKeyToDomainUserApiKey,
  mapPrismaUserRefreshTokenToDomainUserRefreshToken,
  mapPrismaUserToDomainUser
} from '../user.mappers';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
const refreshTokenId = '00000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');
const expiresAt = new Date('2026-02-01T00:00:00.000Z');

const prismaUser: PrismaUser = {
  id: userId,
  username: 'test-user',
  password_hash: 'password-hash',
  state: 'active',
  created_at: createdAt,
  updated_at: updatedAt
};

const user: User = {
  id: userId,
  username: 'test-user',
  state: 'active',
  createdAt,
  updatedAt
};

const prismaApiKey: PrismaUserApiKey = {
  id: apiKeyId,
  user_id: userId,
  secret_hash: 'secret-hash',
  state: 'active',
  name: 'test key',
  created_at: createdAt,
  expires_at: expiresAt,
  last_used_at: null,
  revoked_at: null
};

const apiKey: UserApiKey = {
  id: apiKeyId,
  userId,
  state: 'active',
  name: 'test key',
  createdAt,
  expiresAt,
  lastUsedAt: null,
  revokedAt: null
};

const prismaRefreshToken: PrismaUserRefreshToken = {
  id: refreshTokenId,
  user_id: userId,
  secret_hash: 'secret-hash',
  state: 'active',
  created_at: createdAt,
  expires_at: expiresAt,
  revoked_at: null
};

const refreshToken: UserRefreshToken = {
  id: refreshTokenId,
  userId,
  state: 'active',
  createdAt,
  expiresAt,
  revokedAt: null
};

/* tests */

describe('user mappers', () => {
  test('maps Prisma user entities to domain entities', () => {
    expect(mapPrismaUserToDomainUser(prismaUser)).toEqual(user);
    expect(mapPrismaUserApiKeyToDomainUserApiKey(prismaApiKey)).toEqual(apiKey);
    expect(mapPrismaUserRefreshTokenToDomainUserRefreshToken(prismaRefreshToken)).toEqual(refreshToken);
  });

  test('wraps invalid Prisma entities in mapper errors', () => {
    expect(() =>
      mapPrismaUserToDomainUser({
        ...prismaUser,
        id: 'invalid'
      })
    ).toThrow(GenericMapperError);

    expect(() =>
      mapPrismaUserApiKeyToDomainUserApiKey({
        ...prismaApiKey,
        state: 'invalid' as PrismaUserApiKey['state']
      })
    ).toThrow(GenericMapperError);
  });

  test('maps a user to its HTTP response', () => {
    expect(mapDomainUserToHttpUserResponse(user)).toEqual({
      id: userId,
      username: 'test-user',
      state: 'active',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString()
    });
  });

  test('maps API keys to HTTP responses without exposing ownership or secrets', () => {
    const response = mapDomainUserApiKeyToHttpUserApiKeyResponse(apiKey);

    expect(response).toEqual({
      id: apiKeyId,
      state: 'active',
      name: 'test key',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null
    });
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('secretHash');
    expect(mapDomainUserApiKeysToHttpListApiKeysResponse([apiKey])).toEqual([response]);
  });

  test('maps an API key creation result and preserves its one-time token', () => {
    expect(
      mapCreateApiKeyResultToHttpCreateApiKeyResponse({
        apiKey,
        token: 's3k.token'
      })
    ).toEqual({
      apiKey: mapDomainUserApiKeyToHttpUserApiKeyResponse(apiKey),
      token: 's3k.token'
    });
  });
});
