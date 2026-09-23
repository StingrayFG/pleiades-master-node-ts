import { Buffer } from 'node:buffer';

import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericForbiddenError,
  GenericInternalServerError,
  GenericUnauthorizedError
} from '@/errors/application.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { User, UserApiKey, UserRefreshToken } from '../user.domain';
import { userIdSchema } from '../user.domain';
import {
  createUserApiKeyCredentials,
  createUserRefreshTokenCredentials,
  hashUserPassword,
  parseUserApiKeyToken,
  verifyUserApiKeySecret,
  verifyUserPassword,
  verifyUserRefreshTokenSecret
} from '../user.processors';
import type { UserRepositoryContract } from '../user.repository';
import { UserService } from '../user.service';
import {
  createUserApiKeyTaskDefinition,
  createUserRefreshTokenTaskDefinition,
  createUserTaskDefinition,
  revokeUserApiKeyTaskDefinition,
  revokeUserRefreshTokenTaskDefinition,
  rotateUserRefreshTokenTaskDefinition,
  type CreateUserApiKeyTaskData,
  type CreateUserRefreshTokenTaskData,
  type CreateUserTaskData,
  type RotateUserRefreshTokenTaskData
} from '../user.tasks';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
const refreshTokenId = '00000000-0000-4000-8000-000000000003';
const now = new Date('2026-01-01T00:00:00.000Z');
const expiresAt = new Date('2026-02-01T00:00:00.000Z');
const apiKeyHashKey = Buffer.from('api-key-hash-key');
const refreshTokenHashKey = Buffer.from('refresh-token-hash-key');

const user: User = {
  id: userId,
  username: 'test-user',
  state: 'active',
  createdAt: now,
  updatedAt: now
};

const apiKey: UserApiKey = {
  id: apiKeyId,
  userId,
  state: 'active',
  name: 'test key',
  createdAt: now,
  expiresAt,
  lastUsedAt: null,
  revokedAt: null
};

const refreshToken: UserRefreshToken = {
  id: refreshTokenId,
  userId,
  state: 'active',
  createdAt: now,
  expiresAt,
  revokedAt: null
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

  return repository;
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    getTaskById: jest.fn<TaskServiceContract['getTaskById']>(),
    registerHandler: jest.fn<TaskServiceContract['registerHandler']>(),
    submitTask: jest.fn<TaskServiceContract['submitTask']>(),
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>(),
    executeTaskByDefinitionAndTargets: jest.fn<TaskServiceContract['executeTaskByDefinitionAndTargets']>()
  } as unknown as jest.Mocked<TaskServiceContract>;
};

/* tests */

describe('UserService', () => {
  let passwordHash: string;
  let repository: jest.Mocked<UserRepositoryContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: UserService;

  beforeAll(async () => {
    passwordHash = await hashUserPassword('password123');
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createUserRepositoryMock();
    taskService = createTaskServiceMock();
    service = new UserService(repository, apiKeyHashKey, refreshTokenHashKey, taskService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lists API keys for a user', async () => {
    repository.listApiKeys.mockResolvedValue([apiKey]);

    await expect(service.listApiKeys(userId)).resolves.toEqual([apiKey]);
    expect(repository.listApiKeys).toHaveBeenCalledWith(userId);
  });

  test('normalizes a username, hashes the password, and submits user creation', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(user);

    await expect(service.createUser({ username: 'Test-User', password: 'password123' })).resolves.toBe(user);

    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserTaskData;

    expect(definition).toBe(createUserTaskDefinition);
    expect(userIdSchema.safeParse(taskData.userId).success).toBe(true);
    expect(taskData.username).toBe('test-user');
    await expect(verifyUserPassword(taskData.passwordHash, 'password123')).resolves.toBe(true);
  });

  test('propagates user creation task failures', async () => {
    const taskError = new GenericInternalServerError('Task execution failed');

    taskService.executeTaskByDefinition.mockRejectedValue(taskError);

    await expect(service.createUser({ username: 'test-user', password: 'password123' })).rejects.toBe(taskError);
  });

  test('creates an API key and returns its one-time token', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(apiKey);

    const result = await service.createApiKey({ userId, name: 'test key', expiresAt });
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserApiKeyTaskData;
    const parsedToken = parseUserApiKeyToken(result.token);

    expect(definition).toBe(createUserApiKeyTaskDefinition);
    expect(result.apiKey).toBe(apiKey);
    expect(parsedToken?.id).toBe(taskData.apiKeyId);
    expect(taskData).toMatchObject({ userId, name: 'test key', expiresAt });
    expect(verifyUserApiKeySecret(taskData.secretHash, parsedToken?.secret ?? '', apiKeyHashKey)).toBe(true);
  });

  test('creates a refresh token with the configured expiration', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(refreshToken);

    const token = await service.createRefreshToken(userId);
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserRefreshTokenTaskData;
    const generated = createUserRefreshTokenCredentials(refreshTokenHashKey);
    const [, rawId, secret] = token.split('.');

    expect(definition).toBe(createUserRefreshTokenTaskDefinition);
    expect(taskData.refreshTokenId).toBe(rawId);
    expect(taskData.userId).toBe(userId);
    expect(taskData.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    expect(verifyUserRefreshTokenSecret(taskData.secretHash, secret, refreshTokenHashKey)).toBe(true);
    expect(generated.token).not.toBe(token);
  });

  test('authenticates an active user by normalized username and password', async () => {
    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash });

    await expect(service.authenticatePassword({ username: 'Test-User', password: 'password123' })).resolves.toBe(user);
    expect(repository.findAuthenticationByUsername).toHaveBeenCalledWith('test-user');
  });

  test('rejects missing or invalid password credentials', async () => {
    await expect(
      service.authenticatePassword({ username: 'test-user', password: 'password123' })
    ).rejects.toBeInstanceOf(GenericUnauthorizedError);

    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash });

    await expect(service.authenticatePassword({ username: 'test-user', password: 'wrong' })).rejects.toBeInstanceOf(
      GenericUnauthorizedError
    );
  });

  test('rejects password authentication for a disabled user', async () => {
    repository.findAuthenticationByUsername.mockResolvedValue({
      user: { ...user, state: 'disabled' },
      passwordHash
    });

    await expect(
      service.authenticatePassword({ username: 'test-user', password: 'password123' })
    ).rejects.toBeInstanceOf(GenericForbiddenError);
  });

  test('authenticates an active API key', async () => {
    const credentials = createUserApiKeyCredentials(apiKeyHashKey);

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: { ...apiKey, id: credentials.id },
      secretHash: credentials.secretHash
    });

    await expect(service.authenticateApiKey(credentials.token)).resolves.toEqual({
      userId,
      apiKeyId: credentials.id
    });
  });

  test('rejects malformed, unknown, and invalid-secret API keys', async () => {
    await expect(service.authenticateApiKey('invalid')).rejects.toBeInstanceOf(GenericUnauthorizedError);

    const credentials = createUserApiKeyCredentials(apiKeyHashKey);

    await expect(service.authenticateApiKey(credentials.token)).rejects.toBeInstanceOf(GenericUnauthorizedError);

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: { ...apiKey, id: credentials.id },
      secretHash: credentials.secretHash
    });

    const wrongCredentials = createUserApiKeyCredentials(apiKeyHashKey);
    const wrongToken = `${wrongCredentials.token.split('.')[0]}.${credentials.id}.${wrongCredentials.token.split('.')[2]}`;

    await expect(service.authenticateApiKey(wrongToken)).rejects.toBeInstanceOf(GenericUnauthorizedError);
  });

  test.each([
    { state: 'revoked' as const, revokedAt: now, expiresAt },
    { state: 'active' as const, revokedAt: null, expiresAt: now }
  ])('rejects an inactive or expired API key', async (override) => {
    const credentials = createUserApiKeyCredentials(apiKeyHashKey);

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user,
      apiKey: { ...apiKey, ...override, id: credentials.id },
      secretHash: credentials.secretHash
    });

    await expect(service.authenticateApiKey(credentials.token)).rejects.toBeInstanceOf(GenericUnauthorizedError);
  });

  test('rejects an API key owned by a disabled user', async () => {
    const credentials = createUserApiKeyCredentials(apiKeyHashKey);

    repository.findApiKeyAuthenticationById.mockResolvedValue({
      user: { ...user, state: 'disabled' },
      apiKey: { ...apiKey, id: credentials.id },
      secretHash: credentials.secretHash
    });

    await expect(service.authenticateApiKey(credentials.token)).rejects.toBeInstanceOf(GenericForbiddenError);
  });

  test('rotates a valid refresh token and returns new credentials', async () => {
    const credentials = createUserRefreshTokenCredentials(refreshTokenHashKey);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: { ...refreshToken, id: credentials.id },
      secretHash: credentials.secretHash
    });
    taskService.executeTaskByDefinition.mockResolvedValue(refreshToken);

    const result = await service.refreshAuthentication(credentials.token);
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as RotateUserRefreshTokenTaskData;

    expect(definition).toBe(rotateUserRefreshTokenTaskDefinition);
    expect(result.userId).toBe(userId);
    expect(result.refreshToken).not.toBe(credentials.token);
    expect(taskData.currentRefreshTokenId).toBe(credentials.id);
    expect(taskData.newRefreshTokenId).not.toBe(credentials.id);
  });

  test('rejects malformed, invalid-secret, expired, and disabled-user refresh authentication', async () => {
    await expect(service.refreshAuthentication('invalid')).rejects.toBeInstanceOf(GenericUnauthorizedError);

    const credentials = createUserRefreshTokenCredentials(refreshTokenHashKey);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: { ...refreshToken, id: credentials.id },
      secretHash: credentials.secretHash
    });

    const wrongCredentials = createUserRefreshTokenCredentials(refreshTokenHashKey);
    const wrongToken = `${wrongCredentials.token.split('.')[0]}.${credentials.id}.${wrongCredentials.token.split('.')[2]}`;

    await expect(service.refreshAuthentication(wrongToken)).rejects.toBeInstanceOf(GenericUnauthorizedError);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: { ...refreshToken, id: credentials.id, expiresAt: now },
      secretHash: credentials.secretHash
    });

    await expect(service.refreshAuthentication(credentials.token)).rejects.toBeInstanceOf(GenericUnauthorizedError);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user: { ...user, state: 'disabled' },
      refreshToken: { ...refreshToken, id: credentials.id },
      secretHash: credentials.secretHash
    });

    await expect(service.refreshAuthentication(credentials.token)).rejects.toBeInstanceOf(GenericForbiddenError);
  });

  test('rejects authentication with a revoked refresh token', async () => {
    const credentials = createUserRefreshTokenCredentials(refreshTokenHashKey);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: {
        ...refreshToken,
        id: credentials.id,
        state: 'revoked',
        revokedAt: now
      },
      secretHash: credentials.secretHash
    });

    await expect(service.refreshAuthentication(credentials.token)).rejects.toBeInstanceOf(GenericUnauthorizedError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('submits API key revocation', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(apiKey);

    await expect(service.revokeApiKey({ userId, apiKeyId })).resolves.toBe(apiKey);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(revokeUserApiKeyTaskDefinition, {
      userId,
      apiKeyId
    });
  });

  test('propagates API key revocation task failures', async () => {
    const taskError = new GenericUnauthorizedError('API key revocation was rejected');

    taskService.executeTaskByDefinition.mockRejectedValue(taskError);

    await expect(service.revokeApiKey({ userId, apiKeyId })).rejects.toBe(taskError);
  });

  test('authenticates and submits refresh-token revocation', async () => {
    const credentials = createUserRefreshTokenCredentials(refreshTokenHashKey);

    repository.findRefreshTokenAuthenticationById.mockResolvedValue({
      user,
      refreshToken: { ...refreshToken, id: credentials.id },
      secretHash: credentials.secretHash
    });
    taskService.executeTaskByDefinition.mockResolvedValue(refreshToken);

    await expect(service.revokeRefreshToken(credentials.token)).resolves.toBe(refreshToken);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(revokeUserRefreshTokenTaskDefinition, {
      refreshTokenId: credentials.id
    });
  });

  test('rejects refresh-token revocation with invalid credentials', async () => {
    await expect(service.revokeRefreshToken('invalid')).rejects.toBeInstanceOf(GenericUnauthorizedError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });
});
