import { GenericAlreadyExistsError, GenericNotFoundError, GenericUnauthorizedError } from '@/errors/application.errors';
import type { TaskDefinitionTask } from '@/modules/tasks/task.definition';

import type { UserRepositoryContract } from './user.repository';
import type {
  createUserApiKeyTaskDefinition,
  createUserRefreshTokenTaskDefinition,
  createUserTaskDefinition,
  revokeUserApiKeyTaskDefinition,
  revokeUserRefreshTokenTaskDefinition,
  rotateUserRefreshTokenTaskDefinition
} from './user.tasks';
import type { User, UserApiKey, UserRefreshToken } from './user.domain';

/* handler */

class UserTaskHandler {
  constructor(private readonly repository: UserRepositoryContract) {}

  async createUser(task: TaskDefinitionTask<typeof createUserTaskDefinition>): Promise<User> {
    try {
      return await this.repository.create({
        id: task.data.userId,
        username: task.data.username,
        passwordHash: task.data.passwordHash
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      // a replayed execution finds the user it has already created;
      // the absorb only holds when the existing row is exactly what this task
      // would have created, password hash included
      const existingAuthentication = await this.repository.findAuthenticationByUsername(task.data.username);

      if (
        !existingAuthentication ||
        existingAuthentication.user.id !== task.data.userId ||
        existingAuthentication.passwordHash !== task.data.passwordHash ||
        existingAuthentication.user.state !== 'active'
      ) {
        throw err;
      }

      return existingAuthentication.user;
    }
  }

  async createApiKey(task: TaskDefinitionTask<typeof createUserApiKeyTaskDefinition>): Promise<UserApiKey> {
    try {
      return await this.repository.createApiKey({
        id: task.data.apiKeyId,

        userId: task.data.userId,

        secretHash: task.data.secretHash,

        name: task.data.name,

        expiresAt: task.data.expiresAt
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      // a replayed execution finds the key it has already created;
      // the absorb only holds when the existing row is exactly what this task
      // would have created, lifecycle state included
      const existingAuthentication = await this.repository.findApiKeyAuthenticationById(task.data.apiKeyId);

      if (
        !existingAuthentication ||
        existingAuthentication.apiKey.userId !== task.data.userId ||
        existingAuthentication.secretHash !== task.data.secretHash ||
        existingAuthentication.apiKey.name !== task.data.name ||
        existingAuthentication.apiKey.expiresAt?.getTime() !== task.data.expiresAt?.getTime() ||
        existingAuthentication.apiKey.state !== 'active' ||
        existingAuthentication.apiKey.revokedAt !== null ||
        existingAuthentication.apiKey.lastUsedAt !== null
      ) {
        throw err;
      }

      return existingAuthentication.apiKey;
    }
  }

  async revokeApiKey(task: TaskDefinitionTask<typeof revokeUserApiKeyTaskDefinition>): Promise<UserApiKey> {
    const existingAuthentication = await this.repository.findApiKeyAuthenticationById(task.data.apiKeyId);

    if (!existingAuthentication || existingAuthentication.apiKey.userId !== task.data.userId) {
      throw new GenericNotFoundError('User API key not found');
    }

    // a replayed execution finds the key already revoked and keeps the original revocation time
    if (existingAuthentication.apiKey.state === 'revoked') {
      return existingAuthentication.apiKey;
    }

    return this.repository.revokeApiKey({
      userId: task.data.userId,
      apiKeyId: task.data.apiKeyId
    });
  }

  async createRefreshToken(task: TaskDefinitionTask<typeof createUserRefreshTokenTaskDefinition>): Promise<UserRefreshToken> {
    try {
      return await this.repository.createRefreshToken({
        id: task.data.refreshTokenId,

        userId: task.data.userId,

        secretHash: task.data.secretHash,

        expiresAt: task.data.expiresAt
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      // a replayed execution finds the token it has already created;
      // the absorb only holds when the existing row is exactly what this task
      // would have created, lifecycle state included
      const existingAuthentication = await this.repository.findRefreshTokenAuthenticationById(task.data.refreshTokenId);

      if (
        !existingAuthentication ||
        existingAuthentication.refreshToken.userId !== task.data.userId ||
        existingAuthentication.secretHash !== task.data.secretHash ||
        existingAuthentication.refreshToken.expiresAt.getTime() !== task.data.expiresAt.getTime() ||
        existingAuthentication.refreshToken.state !== 'active' ||
        existingAuthentication.refreshToken.revokedAt !== null
      ) {
        throw err;
      }

      return existingAuthentication.refreshToken;
    }
  }

  async rotateRefreshToken(task: TaskDefinitionTask<typeof rotateUserRefreshTokenTaskDefinition>): Promise<UserRefreshToken> {
    const rotated = await this.repository.rotateRefreshToken({
      currentRefreshTokenId: task.data.currentRefreshTokenId,
      newRefreshTokenId: task.data.newRefreshTokenId,

      userId: task.data.userId,

      secretHash: task.data.secretHash,

      expiresAt: task.data.expiresAt
    });

    if (rotated) {
      return rotated;
    }

    // a replayed execution finds the token it has already rotated to;
    // the absorb only holds when the new row is exactly what this task would have created,
    // secret, expiry, and fresh state included
    const existingAuthentication = await this.repository.findRefreshTokenAuthenticationById(task.data.newRefreshTokenId);

    if (
      !existingAuthentication ||
      existingAuthentication.refreshToken.userId !== task.data.userId ||
      existingAuthentication.secretHash !== task.data.secretHash ||
      existingAuthentication.refreshToken.expiresAt.getTime() !== task.data.expiresAt.getTime() ||
      existingAuthentication.refreshToken.state !== 'active' ||
      existingAuthentication.refreshToken.revokedAt !== null
    ) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    return existingAuthentication.refreshToken;
  }

  async revokeRefreshToken(task: TaskDefinitionTask<typeof revokeUserRefreshTokenTaskDefinition>): Promise<UserRefreshToken> {
    const existingAuthentication = await this.repository.findRefreshTokenAuthenticationById(task.data.refreshTokenId);

    if (!existingAuthentication) {
      throw new GenericNotFoundError('User refresh token not found');
    }

    if (existingAuthentication.refreshToken.state === 'revoked') {
      return existingAuthentication.refreshToken;
    }

    return this.repository.revokeRefreshToken(task.data.refreshTokenId);
  }
}

/* exports */

export { UserTaskHandler };
