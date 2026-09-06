import type {
  UserApiKey as PrismaUserApiKey,
  User as PrismaUser,
  UserRefreshToken as PrismaUserRefreshToken
} from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import type { CreateApiKeyResult } from './user.application';
import {
  userApiKeySchema,
  userRefreshTokenSchema,
  userSchema,
  type User,
  type UserApiKey,
  type UserRefreshToken
} from './user.domain';
import type {
  CreateApiKeyResponse,
  ListApiKeysResponse,
  UserApiKeyResponse,
  UserResponse
} from './user.http-contracts';

/* domain -> http */

export const mapDomainUserApiKeyToHttpUserApiKeyResponse = (apiKey: UserApiKey): UserApiKeyResponse => {
  return withMapperError('Failed to map domain user API key to HTTP user API key', () => {
    return {
      id: apiKey.id,

      state: apiKey.state,

      name: apiKey.name,

      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
      revokedAt: apiKey.revokedAt?.toISOString() ?? null
    };
  });
};

export const mapDomainUserApiKeysToHttpListApiKeysResponse = (apiKeys: UserApiKey[]): ListApiKeysResponse => {
  return withMapperError('Failed to map domain user API keys to HTTP user API keys', () => {
    return apiKeys.map(mapDomainUserApiKeyToHttpUserApiKeyResponse);
  });
};

export const mapDomainUserToHttpUserResponse = (user: User): UserResponse => {
  return withMapperError('Failed to map domain user to HTTP user', () => {
    return {
      id: user.id,

      username: user.username,

      state: user.state,

      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  });
};

/* application -> http */

export const mapCreateApiKeyResultToHttpCreateApiKeyResponse = (
  apiKeyCreation: CreateApiKeyResult
): CreateApiKeyResponse => {
  return withMapperError('Failed to map API key creation result to HTTP API key creation response', () => {
    return {
      apiKey: mapDomainUserApiKeyToHttpUserApiKeyResponse(apiKeyCreation.apiKey),
      token: apiKeyCreation.token
    };
  });
};

/* prisma -> domain */

export const mapPrismaUserApiKeyToDomainUserApiKey = (apiKey: PrismaUserApiKey): UserApiKey => {
  return withMapperError('Failed to map Prisma user API key to domain user API key', () =>
    userApiKeySchema.parse({
      id: apiKey.id,

      userId: apiKey.user_id,

      state: apiKey.state,

      name: apiKey.name,

      createdAt: apiKey.created_at,
      expiresAt: apiKey.expires_at,
      lastUsedAt: apiKey.last_used_at,
      revokedAt: apiKey.revoked_at
    })
  );
};

export const mapPrismaUserToDomainUser = (user: PrismaUser): User => {
  return withMapperError('Failed to map Prisma user to domain user', () =>
    userSchema.parse({
      id: user.id,

      username: user.username,

      state: user.state,

      createdAt: user.created_at,
      updatedAt: user.updated_at
    })
  );
};

export const mapPrismaUserRefreshTokenToDomainUserRefreshToken = (
  refreshToken: PrismaUserRefreshToken
): UserRefreshToken => {
  return withMapperError('Failed to map Prisma user refresh token to domain user refresh token', () =>
    userRefreshTokenSchema.parse({
      id: refreshToken.id,
      userId: refreshToken.user_id,

      state: refreshToken.state,

      createdAt: refreshToken.created_at,
      expiresAt: refreshToken.expires_at,
      revokedAt: refreshToken.revoked_at
    })
  );
};
