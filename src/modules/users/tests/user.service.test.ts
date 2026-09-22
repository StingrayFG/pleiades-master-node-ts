import { Buffer } from 'node:buffer';

import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

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

const createRepositoryMock = (): jest.Mocked<UserRepositoryContract> => {
  return {
    listApiKeys: jest.fn<UserRepositoryContract['listApiKeys']>().mockResolvedValue([]),
    findAuthenticationByUsername: jest.fn<UserRepositoryContract['findAuthenticationByUsername']>(),
    findApiKeyAuthenticationById: jest.fn<UserRepositoryContract['findApiKeyAuthenticationById']>(),
    findRefreshTokenAuthenticationById: jest.fn<UserRepositoryContract['findRefreshTokenAuthenticationById']>()
  } as unknown as jest.Mocked<UserRepositoryContract>;
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>()
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

    repository = createRepositoryMock();
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

  test('normalizes a username and submits user creation', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(user);

    await expect(service.createUser({ username: 'Test-User', password: 'password123' })).resolves.toBe(user);

    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserTaskData;

    expect(definition).toBe(createUserTaskDefinition);
    expect(userIdSchema.safeParse(taskData.userId).success).toBe(true);
    expect(taskData.username).toBe('test-user');
    await expect(verifyUserPassword(taskData.passwordHash, 'password123')).resolves.toBe(true);
  });

  test('creates an API key and returns its one-time token', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(apiKey);

    const result = await service.createApiKey({ userId, name: apiKey.name, expiresAt });
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserApiKeyTaskData;
    const parsedToken = parseUserApiKeyToken(result.token);

    expect(definition).toBe(createUserApiKeyTaskDefinition);
    expect(result.apiKey).toBe(apiKey);
    expect(parsedToken?.id).toBe(taskData.apiKeyId);
    expect(verifyUserApiKeySecret(taskData.secretHash, parsedToken?.secret ?? '', apiKeyHashKey)).toBe(true);
  });

  test('creates a refresh token', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(refreshToken);

    const token = await service.createRefreshToken(userId);
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as CreateUserRefreshTokenTaskData;
    const [, rawId, secret] = token.split('.');

    expect(definition).toBe(createUserRefreshTokenTaskDefinition);
    expect(taskData.refreshTokenId).toBe(rawId);
    expect(taskData.userId).toBe(userId);
    expect(verifyUserRefreshTokenSecret(taskData.secretHash, secret, refreshTokenHashKey)).toBe(true);
  });

  test('authenticates a user by username and password', async () => {
    repository.findAuthenticationByUsername.mockResolvedValue({ user, passwordHash });

    await expect(service.authenticatePassword({ username: 'Test-User', password: 'password123' })).resolves.toBe(user);
    expect(repository.findAuthenticationByUsername).toHaveBeenCalledWith('test-user');
  });

  test('authenticates an API key', async () => {
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

  test('rotates a refresh token', async () => {
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
  });

  test('submits API key revocation', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(apiKey);

    await expect(service.revokeApiKey({ userId, apiKeyId })).resolves.toBe(apiKey);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(revokeUserApiKeyTaskDefinition, {
      userId,
      apiKeyId
    });
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
});
