import {
  Prisma,
  type PrismaClient,
  type User as PrismaUser,
  type UserApiKey as PrismaUserApiKey,
  type UserRefreshToken as PrismaUserRefreshToken
} from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericMapperError, GenericNotFoundError } from '@/errors/application.errors';

import type {
  CreateUserApiKeyRepositoryInput,
  CreateUserRefreshTokenRepositoryInput,
  CreateUserRepositoryInput,
  RotateUserRefreshTokenRepositoryInput
} from '../user.application';
import { UserRepository } from '../user.repository';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
const refreshTokenId = '00000000-0000-4000-8000-000000000003';
const newRefreshTokenId = '00000000-0000-4000-8000-000000000004';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const expiresAt = new Date('2026-02-01T00:00:00.000Z');

const prismaUser: PrismaUser = {
  id: userId,
  username: 'test-user',
  password_hash: 'password-hash',
  state: 'active',
  created_at: createdAt,
  updated_at: createdAt
};

const prismaApiKey: PrismaUserApiKey = {
  id: apiKeyId,
  user_id: userId,
  secret_hash: 'api-key-secret-hash',
  state: 'active',
  name: 'test key',
  created_at: createdAt,
  expires_at: expiresAt,
  last_used_at: null,
  revoked_at: null
};

const prismaRefreshToken: PrismaUserRefreshToken = {
  id: refreshTokenId,
  user_id: userId,
  secret_hash: 'refresh-token-secret-hash',
  state: 'active',
  created_at: createdAt,
  expires_at: expiresAt,
  revoked_at: null
};

const createUserInput: CreateUserRepositoryInput = {
  id: userId,
  username: 'test-user',
  passwordHash: 'password-hash'
};

const createApiKeyInput: CreateUserApiKeyRepositoryInput = {
  id: apiKeyId,
  userId,
  secretHash: 'api-key-secret-hash',
  name: 'test key',
  expiresAt
};

const createRefreshTokenInput: CreateUserRefreshTokenRepositoryInput = {
  id: refreshTokenId,
  userId,
  secretHash: 'refresh-token-secret-hash',
  expiresAt
};

const rotateRefreshTokenInput: RotateUserRefreshTokenRepositoryInput = {
  currentRefreshTokenId: refreshTokenId,
  newRefreshTokenId,
  userId,
  secretHash: 'new-secret-hash',
  expiresAt
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });

/* mocks */

type DelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  findUnique: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  create: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  update: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

const createDelegateMock = (): DelegateMock => ({
  findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>()
});

describe('UserRepository', () => {
  let userDelegate: DelegateMock;
  let apiKeyDelegate: DelegateMock;
  let refreshTokenDelegate: DelegateMock;
  let transaction: jest.Mock<(callback: (tx: PrismaClient) => Promise<unknown>) => Promise<unknown>>;
  let repository: UserRepository;

  beforeEach(() => {
    userDelegate = createDelegateMock();
    apiKeyDelegate = createDelegateMock();
    refreshTokenDelegate = createDelegateMock();

    userDelegate.findUnique.mockResolvedValue(null);
    userDelegate.create.mockResolvedValue(prismaUser);
    apiKeyDelegate.findMany.mockResolvedValue([]);
    apiKeyDelegate.findUnique.mockResolvedValue(null);
    apiKeyDelegate.create.mockResolvedValue(prismaApiKey);
    apiKeyDelegate.update.mockResolvedValue({ ...prismaApiKey, state: 'revoked', revoked_at: createdAt });
    refreshTokenDelegate.findUnique.mockResolvedValue(null);
    refreshTokenDelegate.create.mockResolvedValue(prismaRefreshToken);
    refreshTokenDelegate.update.mockResolvedValue({ ...prismaRefreshToken, state: 'revoked', revoked_at: createdAt });
    refreshTokenDelegate.updateMany.mockResolvedValue({ count: 1 });

    const prisma = {
      user: userDelegate,
      userApiKey: apiKeyDelegate,
      userRefreshToken: refreshTokenDelegate
    } as unknown as PrismaClient;

    transaction = jest.fn(async (callback) => callback(prisma));
    Object.assign(prisma, { $transaction: transaction });

    repository = new UserRepository(prisma);
  });

  test('lists API keys for a user in newest-first order', async () => {
    apiKeyDelegate.findMany.mockResolvedValue([prismaApiKey]);

    await expect(repository.listApiKeys(userId)).resolves.toEqual([expect.objectContaining({ id: apiKeyId, userId })]);
    expect(apiKeyDelegate.findMany).toHaveBeenCalledWith({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
  });

  test('propagates mapper failures from invalid Prisma rows', async () => {
    apiKeyDelegate.findMany.mockResolvedValue([{ ...prismaApiKey, id: 'invalid' }]);

    await expect(repository.listApiKeys(userId)).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('finds users and password authentication records', async () => {
    userDelegate.findUnique.mockResolvedValue(prismaUser);

    await expect(repository.findById(userId)).resolves.toMatchObject({ id: userId });
    await expect(repository.findAuthenticationByUsername('test-user')).resolves.toEqual({
      user: expect.objectContaining({ id: userId }),
      passwordHash: 'password-hash'
    });
    expect(userDelegate.findUnique).toHaveBeenNthCalledWith(1, { where: { id: userId } });
    expect(userDelegate.findUnique).toHaveBeenNthCalledWith(2, { where: { username: 'test-user' } });
  });

  test('returns null for missing users and authentication records', async () => {
    await expect(repository.findById(userId)).resolves.toBeNull();
    await expect(repository.findAuthenticationByUsername('test-user')).resolves.toBeNull();
  });

  test('finds API key authentication with its owner and secret hash', async () => {
    apiKeyDelegate.findUnique.mockResolvedValue({ ...prismaApiKey, user: prismaUser });

    await expect(repository.findApiKeyAuthenticationById(apiKeyId)).resolves.toEqual({
      user: expect.objectContaining({ id: userId }),
      apiKey: expect.objectContaining({ id: apiKeyId }),
      secretHash: 'api-key-secret-hash'
    });
    expect(apiKeyDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: apiKeyId },
      include: { user: true }
    });
  });

  test('finds refresh-token authentication with its owner and secret hash', async () => {
    refreshTokenDelegate.findUnique.mockResolvedValue({ ...prismaRefreshToken, user: prismaUser });

    await expect(repository.findRefreshTokenAuthenticationById(refreshTokenId)).resolves.toEqual({
      user: expect.objectContaining({ id: userId }),
      refreshToken: expect.objectContaining({ id: refreshTokenId }),
      secretHash: 'refresh-token-secret-hash'
    });
  });

  test('creates users with an explicit active state', async () => {
    await repository.create(createUserInput);

    expect(userDelegate.create).toHaveBeenCalledWith({
      data: {
        id: userId,
        username: 'test-user',
        password_hash: 'password-hash',
        state: 'active'
      }
    });
  });

  test('maps user uniqueness violations to already-exists errors', async () => {
    userDelegate.create.mockRejectedValue(createPrismaError('P2002'));

    await expect(repository.create(createUserInput)).rejects.toBeInstanceOf(GenericAlreadyExistsError);
  });

  test('creates API keys and refresh tokens with explicit active state', async () => {
    await repository.createApiKey(createApiKeyInput);
    await repository.createRefreshToken(createRefreshTokenInput);

    expect(apiKeyDelegate.create).toHaveBeenCalledWith({
      data: {
        id: apiKeyId,
        user_id: userId,
        secret_hash: 'api-key-secret-hash',
        state: 'active',
        name: 'test key',
        expires_at: expiresAt
      }
    });
    expect(refreshTokenDelegate.create).toHaveBeenCalledWith({
      data: {
        id: refreshTokenId,
        user_id: userId,
        secret_hash: 'refresh-token-secret-hash',
        state: 'active',
        expires_at: expiresAt
      }
    });
  });

  test('atomically revokes the current refresh token and creates its replacement', async () => {
    refreshTokenDelegate.create.mockResolvedValue({ ...prismaRefreshToken, id: newRefreshTokenId });

    await expect(repository.rotateRefreshToken(rotateRefreshTokenInput)).resolves.toMatchObject({
      id: newRefreshTokenId
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(refreshTokenDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: refreshTokenId, user_id: userId, state: 'active' },
      data: { state: 'revoked', revoked_at: expect.any(Date) }
    });
    expect(refreshTokenDelegate.create).toHaveBeenCalledWith({
      data: {
        id: newRefreshTokenId,
        user_id: userId,
        secret_hash: 'new-secret-hash',
        state: 'active',
        expires_at: expiresAt
      }
    });
  });

  test('returns null without creating a replacement when refresh-token rotation loses its state gate', async () => {
    refreshTokenDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.rotateRefreshToken(rotateRefreshTokenInput)).resolves.toBeNull();
    expect(refreshTokenDelegate.create).not.toHaveBeenCalled();
  });

  test('revokes API keys and refresh tokens', async () => {
    await repository.revokeApiKey({ userId, apiKeyId });
    await repository.revokeRefreshToken(refreshTokenId);

    expect(apiKeyDelegate.update).toHaveBeenCalledWith({
      where: { id: apiKeyId, user_id: userId },
      data: { state: 'revoked', revoked_at: expect.any(Date) }
    });
    expect(refreshTokenDelegate.update).toHaveBeenCalledWith({
      where: { id: refreshTokenId },
      data: { state: 'revoked', revoked_at: expect.any(Date) }
    });
  });

  test('maps missing revoke targets to not-found errors', async () => {
    apiKeyDelegate.update.mockRejectedValue(createPrismaError('P2025'));

    await expect(repository.revokeApiKey({ userId, apiKeyId })).rejects.toBeInstanceOf(GenericNotFoundError);
  });
});
