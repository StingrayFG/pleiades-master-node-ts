import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';

import type {
  FindAuthenticationByUsernameRepositoryResult,
  FindApiKeyAuthenticationByIdRepositoryResult,
  FindRefreshTokenAuthenticationByIdRepositoryResult,
  CreateUserRepositoryInput,
  CreateUserApiKeyRepositoryInput,
  CreateUserRefreshTokenRepositoryInput,
  RotateUserRefreshTokenRepositoryInput,
  RevokeUserApiKeyRepositoryInput
} from './user.application';
import type {
  User,
  UserApiKey,
  UserApiKeyId,
  UserId,
  UserRefreshToken,
  UserRefreshTokenId,
  UserUsername
} from './user.domain';
import {
  mapPrismaUserApiKeyToDomainUserApiKey,
  mapPrismaUserToDomainUser,
  mapPrismaUserRefreshTokenToDomainUserRefreshToken
} from './user.mappers';

/* contract */

type UserRepositoryContract = {
  listApiKeys(userId: UserId): Promise<UserApiKey[]>;
  findById(id: UserId): Promise<User | null>;
  findAuthenticationByUsername(username: UserUsername): Promise<FindAuthenticationByUsernameRepositoryResult | null>;
  findApiKeyAuthenticationById(id: UserApiKeyId): Promise<FindApiKeyAuthenticationByIdRepositoryResult | null>;
  findRefreshTokenAuthenticationById(
    id: UserRefreshTokenId
  ): Promise<FindRefreshTokenAuthenticationByIdRepositoryResult | null>;
  create(input: CreateUserRepositoryInput): Promise<User>;
  createApiKey(input: CreateUserApiKeyRepositoryInput): Promise<UserApiKey>;
  createRefreshToken(input: CreateUserRefreshTokenRepositoryInput): Promise<UserRefreshToken>;
  rotateRefreshToken(input: RotateUserRefreshTokenRepositoryInput): Promise<UserRefreshToken | null>;
  revokeApiKey(input: RevokeUserApiKeyRepositoryInput): Promise<UserApiKey>;
  revokeRefreshToken(id: UserRefreshTokenId): Promise<UserRefreshToken>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class UserRepository implements UserRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listApiKeys(userId: UserId): Promise<UserApiKey[]> {
    let apiKeys;

    try {
      apiKeys = await this.prisma.userApiKey.findMany({
        where: {
          user_id: userId
        },
        orderBy: {
          created_at: 'desc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return apiKeys.map(mapPrismaUserApiKeyToDomainUserApiKey);
  }

  async findById(id: UserId): Promise<User | null> {
    let user;

    try {
      user = await this.prisma.user.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!user) {
      return null;
    }

    return mapPrismaUserToDomainUser(user);
  }

  async findAuthenticationByUsername(
    username: UserUsername
  ): Promise<FindAuthenticationByUsernameRepositoryResult | null> {
    let user;

    try {
      user = await this.prisma.user.findUnique({
        where: {
          username
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!user) {
      return null;
    }

    return {
      user: mapPrismaUserToDomainUser(user),
      passwordHash: user.password_hash
    };
  }

  async findApiKeyAuthenticationById(id: UserApiKeyId): Promise<FindApiKeyAuthenticationByIdRepositoryResult | null> {
    let apiKey;

    try {
      apiKey = await this.prisma.userApiKey.findUnique({
        where: {
          id
        },
        include: {
          user: true
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!apiKey) {
      return null;
    }

    return {
      user: mapPrismaUserToDomainUser(apiKey.user),

      apiKey: mapPrismaUserApiKeyToDomainUserApiKey(apiKey),

      secretHash: apiKey.secret_hash
    };
  }

  async findRefreshTokenAuthenticationById(
    id: UserRefreshTokenId
  ): Promise<FindRefreshTokenAuthenticationByIdRepositoryResult | null> {
    let refreshToken;

    try {
      refreshToken = await this.prisma.userRefreshToken.findUnique({
        where: {
          id
        },
        include: {
          user: true
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!refreshToken) {
      return null;
    }

    return {
      user: mapPrismaUserToDomainUser(refreshToken.user),

      refreshToken: mapPrismaUserRefreshTokenToDomainUserRefreshToken(refreshToken),

      secretHash: refreshToken.secret_hash
    };
  }

  async create(input: CreateUserRepositoryInput): Promise<User> {
    let user;

    try {
      user = await this.prisma.user.create({
        data: {
          username: input.username,
          password_hash: input.passwordHash,

          state: 'active'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaUserToDomainUser(user);
  }

  async createApiKey(input: CreateUserApiKeyRepositoryInput): Promise<UserApiKey> {
    let apiKey;

    try {
      apiKey = await this.prisma.userApiKey.create({
        data: {
          id: input.id,

          user_id: input.userId,

          secret_hash: input.secretHash,

          state: 'active',

          name: input.name,

          expires_at: input.expiresAt
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaUserApiKeyToDomainUserApiKey(apiKey);
  }

  async createRefreshToken(input: CreateUserRefreshTokenRepositoryInput): Promise<UserRefreshToken> {
    let refreshToken;

    try {
      refreshToken = await this.prisma.userRefreshToken.create({
        data: {
          id: input.id,

          user_id: input.userId,

          secret_hash: input.secretHash,

          state: 'active',

          expires_at: input.expiresAt
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaUserRefreshTokenToDomainUserRefreshToken(refreshToken);
  }

  async rotateRefreshToken(input: RotateUserRefreshTokenRepositoryInput): Promise<UserRefreshToken | null> {
    let refreshToken;

    try {
      refreshToken = await this.prisma.$transaction(async (tx) => {
        const revoked = await tx.userRefreshToken.updateMany({
          where: {
            id: input.currentRefreshTokenId,

            user_id: input.userId,

            state: 'active'
          },

          data: {
            state: 'revoked',

            revoked_at: new Date()
          }
        });

        if (revoked.count !== 1) {
          return null;
        }

        return tx.userRefreshToken.create({
          data: {
            id: input.newRefreshTokenId,

            user_id: input.userId,

            secret_hash: input.secretHash,

            state: 'active',

            expires_at: input.expiresAt
          }
        });
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return refreshToken ? mapPrismaUserRefreshTokenToDomainUserRefreshToken(refreshToken) : null;
  }

  async revokeApiKey(input: RevokeUserApiKeyRepositoryInput): Promise<UserApiKey> {
    let apiKey;

    try {
      apiKey = await this.prisma.userApiKey.update({
        where: {
          id: input.apiKeyId,
          user_id: input.userId
        },
        data: {
          state: 'revoked',
          revoked_at: new Date()
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaUserApiKeyToDomainUserApiKey(apiKey);
  }

  async revokeRefreshToken(id: UserRefreshTokenId): Promise<UserRefreshToken> {
    let refreshToken;

    try {
      refreshToken = await this.prisma.userRefreshToken.update({
        where: {
          id
        },
        data: {
          state: 'revoked',
          revoked_at: new Date()
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaUserRefreshTokenToDomainUserRefreshToken(refreshToken);
  }
}

/* exports */

export { UserRepository };
export type { UserRepositoryContract };
