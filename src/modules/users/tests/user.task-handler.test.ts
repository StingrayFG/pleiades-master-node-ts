import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError } from '@/errors/application.errors';

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
  originMasterNodeId: 'master-node-test',
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

const createRepositoryMock = (): jest.Mocked<UserRepositoryContract> => {
  return {
    findAuthenticationByUsername: jest.fn<UserRepositoryContract['findAuthenticationByUsername']>(),
    findApiKeyAuthenticationById: jest.fn<UserRepositoryContract['findApiKeyAuthenticationById']>(),
    findRefreshTokenAuthenticationById: jest.fn<UserRepositoryContract['findRefreshTokenAuthenticationById']>(),
    create: jest.fn<UserRepositoryContract['create']>().mockResolvedValue(user),
    createApiKey: jest.fn<UserRepositoryContract['createApiKey']>().mockResolvedValue(apiKey),
    createRefreshToken: jest.fn<UserRepositoryContract['createRefreshToken']>().mockResolvedValue(refreshToken),
    rotateRefreshToken: jest.fn<UserRepositoryContract['rotateRefreshToken']>().mockResolvedValue(newRefreshToken),
    revokeApiKey: jest.fn<UserRepositoryContract['revokeApiKey']>().mockResolvedValue({
      ...apiKey,
      state: 'revoked',
      revokedAt: createdAt
    }),
    revokeRefreshToken: jest.fn<UserRepositoryContract['revokeRefreshToken']>().mockResolvedValue({
      ...refreshToken,
      state: 'revoked',
      revokedAt: createdAt
    })
  } as unknown as jest.Mocked<UserRepositoryContract>;
};

/* tests */

describe('UserTaskHandler', () => {
  let repository: jest.Mocked<UserRepositoryContract>;
  let handler: UserTaskHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    handler = new UserTaskHandler(repository);
  });

  test('creates a user from task data', async () => {
    await expect(handler.createUser(createUserTask)).resolves.toBe(user);
    expect(repository.create).toHaveBeenCalledWith({
      id: userId,
      username: user.username,
      passwordHash: 'password-hash'
    });
  });

  test('accepts a replay of an already created user', async () => {
    repository.create.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash: 'password-hash' });

    await expect(handler.createUser(createUserTask)).resolves.toBe(user);
  });

  test('creates an API key from task data', async () => {
    await expect(handler.createApiKey(createApiKeyTask)).resolves.toBe(apiKey);
    expect(repository.createApiKey).toHaveBeenCalledWith({
      id: apiKeyId,
      userId,
      secretHash: 'api-key-secret-hash',
      name: apiKey.name,
      expiresAt
    });
  });

  test('accepts a replay of an already created API key', async () => {
    repository.createApiKey.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey,
      secretHash: 'api-key-secret-hash'
    });

    await expect(handler.createApiKey(createApiKeyTask)).resolves.toBe(apiKey);
  });

  test('revokes an active API key', async () => {
    repository.findApiKeyAuthenticationById.mockResolvedValue({ user, apiKey, secretHash: 'secret-hash' });

    await handler.revokeApiKey(revokeApiKeyTask);

    expect(repository.revokeApiKey).toHaveBeenCalledWith({ userId, apiKeyId });
  });

  test('accepts a replay of an already revoked API key', async () => {
    const revokedApiKey = { ...apiKey, state: 'revoked' as const, revokedAt: createdAt };

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: revokedApiKey,
      secretHash: 'secret-hash'
    });

    await expect(handler.revokeApiKey(revokeApiKeyTask)).resolves.toBe(revokedApiKey);
    expect(repository.revokeApiKey).not.toHaveBeenCalled();
  });

  test('creates a refresh token from task data', async () => {
    await expect(handler.createRefreshToken(createRefreshTokenTask)).resolves.toBe(refreshToken);
    expect(repository.createRefreshToken).toHaveBeenCalledWith({
      id: refreshTokenId,
      userId,
      secretHash: 'refresh-token-secret-hash',
      expiresAt
    });
  });

  test('accepts a replay of an already created refresh token', async () => {
    repository.createRefreshToken.mockRejectedValue(new GenericAlreadyExistsError());
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken,
      secretHash: 'refresh-token-secret-hash'
    });

    await expect(handler.createRefreshToken(createRefreshTokenTask)).resolves.toBe(refreshToken);
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

  test('accepts a replay of an already rotated refresh token', async () => {
    repository.rotateRefreshToken.mockResolvedValue(null);
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: newRefreshToken,
      secretHash: 'new-refresh-token-secret-hash'
    });

    await expect(handler.rotateRefreshToken(rotateRefreshTokenTask)).resolves.toBe(newRefreshToken);
  });

  test('revokes an active refresh token', async () => {
    repository.findRefreshTokenAuthenticationById.mockResolvedValue({ user, refreshToken, secretHash: 'secret-hash' });

    await handler.revokeRefreshToken(revokeRefreshTokenTask);

    expect(repository.revokeRefreshToken).toHaveBeenCalledWith(refreshTokenId);
  });

  test('accepts a replay of an already revoked refresh token', async () => {
    const revokedRefreshToken = { ...refreshToken, state: 'revoked' as const, revokedAt: createdAt };

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: revokedRefreshToken,
      secretHash: 'secret-hash'
    });

    await expect(handler.revokeRefreshToken(revokeRefreshTokenTask)).resolves.toBe(revokedRefreshToken);
    expect(repository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});
