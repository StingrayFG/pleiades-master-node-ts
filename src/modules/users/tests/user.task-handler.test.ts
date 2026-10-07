import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAlreadyExistsError,
  GenericInternalServerError,
  GenericNotFoundError,
  GenericUnauthorizedError
} from '@/errors/application.errors';

import type { User, UserApiKey, UserRefreshToken } from '../user.domain';
import type { UserRepositoryContract } from '../user.repository';
import { UserTaskHandler } from '../user.task-handler';
import type {
  CreateUserApiKeyTask,
  CreateUserRefreshTokenTask,
  CreateUserTask,
  RevokeUserApiKeyTask,
  RevokeUserRefreshTokenTask,
  RotateUserRefreshTokenTask
} from '../user.tasks';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
const refreshTokenId = '00000000-0000-4000-8000-000000000003';
const newRefreshTokenId = '00000000-0000-4000-8000-000000000004';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const expiresAt = new Date('2026-02-01T00:00:00.000Z');

const user: User = {
  id: userId,
  username: 'test-user',
  state: 'active',
  createdAt,
  updatedAt: createdAt
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

const refreshToken: UserRefreshToken = {
  id: refreshTokenId,
  userId,
  state: 'active',
  createdAt,
  expiresAt,
  revokedAt: null
};

const newRefreshToken: UserRefreshToken = {
  ...refreshToken,
  id: newRefreshTokenId
};

const taskBase = {
  id: '00000000-0000-4000-8000-000000000099',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 1n,
  sequence: 2n,
  state: 'pending' as const,
  revision: 0n,
  executionScope: 'cluster' as const
};

const createUserTask: CreateUserTask = {
  ...taskBase,
  type: 'user.create',
  data: {
    userId,
    username: user.username,
    passwordHash: 'password-hash'
  }
};

const createApiKeyTask: CreateUserApiKeyTask = {
  ...taskBase,
  type: 'user.api-key.create',
  data: {
    apiKeyId,
    userId,
    secretHash: 'api-key-secret-hash',
    name: apiKey.name,
    expiresAt
  }
};

const revokeApiKeyTask: RevokeUserApiKeyTask = {
  ...taskBase,
  type: 'user.api-key.revoke',
  data: { userId, apiKeyId }
};

const createRefreshTokenTask: CreateUserRefreshTokenTask = {
  ...taskBase,
  type: 'user.refresh-token.create',
  data: {
    refreshTokenId,
    userId,
    secretHash: 'refresh-token-secret-hash',
    expiresAt
  }
};

const rotateRefreshTokenTask: RotateUserRefreshTokenTask = {
  ...taskBase,
  type: 'user.refresh-token.rotate',
  data: {
    currentRefreshTokenId: refreshTokenId,
    newRefreshTokenId,
    userId,
    secretHash: 'new-refresh-token-secret-hash',
    expiresAt
  }
};

const revokeRefreshTokenTask: RevokeUserRefreshTokenTask = {
  ...taskBase,
  type: 'user.refresh-token.revoke',
  data: { refreshTokenId }
};

/* mocks */

const createUserRepositoryMock = (): jest.Mocked<UserRepositoryContract> => {
  const repository = {
    listApiKeys: jest.fn<UserRepositoryContract['listApiKeys']>(),
    findById: jest.fn<UserRepositoryContract['findById']>(),
    findAuthenticationByUsername: jest.fn<UserRepositoryContract['findAuthenticationByUsername']>(),
    findApiKeyAuthenticationById: jest.fn<UserRepositoryContract['findApiKeyAuthenticationById']>(),
    findRefreshTokenAuthenticationById: jest.fn<UserRepositoryContract['findRefreshTokenAuthenticationById']>(),
    create: jest.fn<UserRepositoryContract['create']>(),
    createApiKey: jest.fn<UserRepositoryContract['createApiKey']>(),
    createRefreshToken: jest.fn<UserRepositoryContract['createRefreshToken']>(),
    rotateRefreshToken: jest.fn<UserRepositoryContract['rotateRefreshToken']>(),
    revokeApiKey: jest.fn<UserRepositoryContract['revokeApiKey']>(),
    revokeRefreshToken: jest.fn<UserRepositoryContract['revokeRefreshToken']>()
  };

  repository.listApiKeys.mockResolvedValue([]);
  repository.findById.mockResolvedValue(null);
  repository.findAuthenticationByUsername.mockResolvedValue(null);
  repository.findApiKeyAuthenticationById.mockResolvedValue(null);
  repository.findRefreshTokenAuthenticationById.mockResolvedValue(null);
  repository.create.mockResolvedValue(user);
  repository.createApiKey.mockResolvedValue(apiKey);
  repository.createRefreshToken.mockResolvedValue(refreshToken);
  repository.rotateRefreshToken.mockResolvedValue(newRefreshToken);
  repository.revokeApiKey.mockResolvedValue({ ...apiKey, state: 'revoked', revokedAt: createdAt });
  repository.revokeRefreshToken.mockResolvedValue({ ...refreshToken, state: 'revoked', revokedAt: createdAt });

  return repository;
};

/* tests */

describe('UserTaskHandler', () => {
  let repository: jest.Mocked<UserRepositoryContract>;
  let handler: UserTaskHandler;

  beforeEach(() => {
    repository = createUserRepositoryMock();
    handler = new UserTaskHandler(repository);
  });

  test('creates a user from task data without a reconciliation lookup', async () => {
    await expect(handler.createUser(createUserTask)).resolves.toBe(user);
    expect(repository.create).toHaveBeenCalledWith({
      id: userId,
      username: 'test-user',
      passwordHash: 'password-hash'
    });
    expect(repository.findAuthenticationByUsername).not.toHaveBeenCalled();
  });

  test('returns an identical existing user when create is replayed', async () => {
    repository.create.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash: 'password-hash' });

    await expect(handler.createUser(createUserTask)).resolves.toBe(user);
  });

  test('preserves a duplicate user error when existing authentication differs', async () => {
    const error = new GenericAlreadyExistsError();

    repository.create.mockRejectedValue(error);
    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash: 'different' });

    await expect(handler.createUser(createUserTask)).rejects.toBe(error);
  });

  test('preserves non-duplicate user creation errors without reconciliation', async () => {
    const error = new GenericInternalServerError();

    repository.create.mockRejectedValue(error);

    await expect(handler.createUser(createUserTask)).rejects.toBe(error);
    expect(repository.findAuthenticationByUsername).not.toHaveBeenCalled();
  });

  test('creates an API key and reconciles an identical replay', async () => {
    await expect(handler.createApiKey(createApiKeyTask)).resolves.toBe(apiKey);

    repository.createApiKey.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey,
      secretHash: 'api-key-secret-hash'
    });

    await expect(handler.createApiKey(createApiKeyTask)).resolves.toBe(apiKey);
  });

  test('rejects an API key create replay when the matching existing key is revoked', async () => {
    const error = new GenericAlreadyExistsError();

    repository.createApiKey.mockRejectedValue(error);
    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: { ...apiKey, state: 'revoked', revokedAt: createdAt },
      secretHash: 'api-key-secret-hash'
    });

    await expect(handler.createApiKey(createApiKeyTask)).rejects.toBe(error);
  });

  test('revokes an active owned API key', async () => {
    repository.findApiKeyAuthenticationById.mockResolvedValue({ user, apiKey, secretHash: 'secret-hash' });

    await handler.revokeApiKey(revokeApiKeyTask);

    expect(repository.revokeApiKey).toHaveBeenCalledWith({ userId, apiKeyId });
  });

  test('returns an already revoked API key without updating it again', async () => {
    const revokedApiKey = { ...apiKey, state: 'revoked' as const, revokedAt: createdAt };

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: revokedApiKey,
      secretHash: 'secret-hash'
    });

    await expect(handler.revokeApiKey(revokeApiKeyTask)).resolves.toBe(revokedApiKey);
    expect(repository.revokeApiKey).not.toHaveBeenCalled();
  });

  test('does not expose API keys belonging to another user', async () => {
    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: { ...apiKey, userId: '00000000-0000-4000-8000-000000000088' },
      secretHash: 'secret-hash'
    });

    await expect(handler.revokeApiKey(revokeApiKeyTask)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  test('creates a refresh token and reconciles an identical replay', async () => {
    await expect(handler.createRefreshToken(createRefreshTokenTask)).resolves.toBe(refreshToken);

    repository.createRefreshToken.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken,
      secretHash: 'refresh-token-secret-hash'
    });

    await expect(handler.createRefreshToken(createRefreshTokenTask)).resolves.toBe(refreshToken);
  });

  test('rejects a refresh-token create replay when the matching existing token is revoked', async () => {
    const error = new GenericAlreadyExistsError();

    repository.createRefreshToken.mockRejectedValue(error);
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: { ...refreshToken, state: 'revoked', revokedAt: createdAt },
      secretHash: 'refresh-token-secret-hash'
    });

    await expect(handler.createRefreshToken(createRefreshTokenTask)).rejects.toBe(error);
  });

  test('rotates an active refresh token', async () => {
    await expect(handler.rotateRefreshToken(rotateRefreshTokenTask)).resolves.toBe(newRefreshToken);
    expect(repository.rotateRefreshToken).toHaveBeenCalledWith({
      currentRefreshTokenId: refreshTokenId,
      newRefreshTokenId,
      userId,
      secretHash: 'new-refresh-token-secret-hash',
      expiresAt
    });
  });

  test('returns an identical replacement token when rotation is replayed', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: newRefreshToken,
      secretHash: 'new-refresh-token-secret-hash'
    });

    await expect(handler.rotateRefreshToken(rotateRefreshTokenTask)).resolves.toBe(newRefreshToken);
  });

  test('rejects a rotation replay when the matching replacement token is revoked', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: {
        ...newRefreshToken,
        state: 'revoked',
        revokedAt: createdAt
      },
      secretHash: 'new-refresh-token-secret-hash'
    });

    await expect(handler.rotateRefreshToken(rotateRefreshTokenTask)).rejects.toBeInstanceOf(GenericUnauthorizedError);
  });

  test('rejects a failed rotation when its replacement cannot be reconciled', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);

    await expect(handler.rotateRefreshToken(rotateRefreshTokenTask)).rejects.toBeInstanceOf(GenericUnauthorizedError);
  });

  test('revokes an active refresh token', async () => {
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken,
      secretHash: 'secret-hash'
    });

    await handler.revokeRefreshToken(revokeRefreshTokenTask);

    expect(repository.revokeRefreshToken).toHaveBeenCalledWith(refreshTokenId);
  });

  test('returns an already revoked refresh token without updating it again', async () => {
    const revokedRefreshToken = { ...refreshToken, state: 'revoked' as const, revokedAt: createdAt };

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: revokedRefreshToken,
      secretHash: 'secret-hash'
    });

    await expect(handler.revokeRefreshToken(revokeRefreshTokenTask)).resolves.toBe(revokedRefreshToken);
    expect(repository.revokeRefreshToken).not.toHaveBeenCalled();
  });

  test('rejects revocation of an unknown refresh token', async () => {
    await expect(handler.revokeRefreshToken(revokeRefreshTokenTask)).rejects.toBeInstanceOf(GenericNotFoundError);
  });
});
