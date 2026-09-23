import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericUnauthorizedError } from '@/errors/application.errors';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import type { User, UserApiKey, UserRefreshToken } from '../user.domain';
import { UserController } from '../user.http-controller';
import { createUserHttpRoutes } from '../user.http-routes';
import type { UserServiceContract } from '../user.service';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const apiKeyId = '00000000-0000-4000-8000-000000000002';
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

const revokedRefreshToken: UserRefreshToken = {
  id: '00000000-0000-4000-8000-000000000003',
  userId,
  state: 'revoked',
  createdAt,
  expiresAt,
  revokedAt: createdAt
};

const apiKeyResponse = {
  id: apiKeyId,
  state: 'active',
  name: 'test key',
  createdAt: createdAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  lastUsedAt: null,
  revokedAt: null
};

/* mocks */

const createUserServiceMock = (): jest.Mocked<UserServiceContract> => {
  const service = {
    listApiKeys: jest.fn<UserServiceContract['listApiKeys']>(),
    createUser: jest.fn<UserServiceContract['createUser']>(),
    createApiKey: jest.fn<UserServiceContract['createApiKey']>(),
    createRefreshToken: jest.fn<UserServiceContract['createRefreshToken']>(),
    authenticatePassword: jest.fn<UserServiceContract['authenticatePassword']>(),
    authenticateApiKey: jest.fn<UserServiceContract['authenticateApiKey']>(),
    refreshAuthentication: jest.fn<UserServiceContract['refreshAuthentication']>(),
    revokeApiKey: jest.fn<UserServiceContract['revokeApiKey']>(),
    revokeRefreshToken: jest.fn<UserServiceContract['revokeRefreshToken']>()
  };

  service.listApiKeys.mockResolvedValue([]);
  service.createUser.mockResolvedValue(user);
  service.createApiKey.mockResolvedValue({ apiKey, token: 's3k.api-key-token' });
  service.createRefreshToken.mockResolvedValue('s3r.refresh-token');
  service.authenticatePassword.mockResolvedValue(user);
  service.authenticateApiKey.mockResolvedValue({ userId, apiKeyId });
  service.refreshAuthentication.mockResolvedValue({ userId, refreshToken: 's3r.rotated-token' });
  service.revokeApiKey.mockResolvedValue(apiKey);
  service.revokeRefreshToken.mockResolvedValue(revokedRefreshToken);

  return service;
};

const createTestApp = async (
  service: UserServiceContract,
  { authenticated = true }: { authenticated?: boolean } = {}
): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorateReply('jwtSign', async () => 'signed-access-token');
  app.decorate('JWTAuthMW', async (request: FastifyRequest) => {
    if (!authenticated) {
      throw new GenericUnauthorizedError('Invalid client token');
    }

    request.auth = {
      userId,
      authType: 'jwt'
    };
  });

  app.register(errorHandlerPlugin);
  app.register(
    createUserHttpRoutes({
      controller: new UserController(service)
    })
  );

  await app.ready();

  return app;
};

/* tests */

describe('user HTTP routes', () => {
  let app: FastifyInstance | undefined;
  let service: jest.Mocked<UserServiceContract>;

  beforeEach(() => {
    service = createUserServiceMock();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('signs up a user through the public route', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { username: 'test-user', password: 'password123' }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: userId,
      username: 'test-user',
      state: 'active',
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    });
    expect(service.createUser).toHaveBeenCalledWith({ username: 'test-user', password: 'password123' });
  });

  test('rejects an invalid signup body before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { username: 'ab', password: 'short' }
    });

    expect(response.statusCode).toBe(400);
    expect(service.createUser).not.toHaveBeenCalled();
  });

  test('logs in and returns signed access and refresh tokens', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'test-user', password: 'password123' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 's3r.refresh-token'
    });
    expect(service.authenticatePassword).toHaveBeenCalledWith({ username: 'test-user', password: 'password123' });
    expect(service.createRefreshToken).toHaveBeenCalledWith(userId);
  });

  test('refreshes authentication through the public route', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 's3r.refresh-token' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 's3r.rotated-token'
    });
  });

  test('logs out by revoking the supplied refresh token', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 's3r.refresh-token' }
    });

    expect(response.statusCode).toBe(204);
    expect(service.revokeRefreshToken).toHaveBeenCalledWith('s3r.refresh-token');
  });

  test('rejects malformed refresh and logout bodies before calling the service', async () => {
    app = await createTestApp(service, { authenticated: false });

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {}
    });
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: {}
    });

    expect(refreshResponse.statusCode).toBe(400);
    expect(logoutResponse.statusCode).toBe(400);
    expect(service.refreshAuthentication).not.toHaveBeenCalled();
    expect(service.revokeRefreshToken).not.toHaveBeenCalled();
  });

  test('requires JWT authentication for API key routes', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({ method: 'GET', url: '/api-keys' });

    expect(response.statusCode).toBe(401);
    expect(service.listApiKeys).not.toHaveBeenCalled();
  });

  test('lists API keys for the authenticated user', async () => {
    app = await createTestApp(service);
    service.listApiKeys.mockResolvedValue([apiKey]);

    const response = await app.inject({ method: 'GET', url: '/api-keys' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([apiKeyResponse]);
    expect(service.listApiKeys).toHaveBeenCalledWith(userId);
  });

  test('creates an API key for the authenticated user', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/api-keys',
      payload: { name: 'test key', expiresAt: expiresAt.toISOString() }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ apiKey: apiKeyResponse, token: 's3k.api-key-token' });
    expect(service.createApiKey).toHaveBeenCalledWith({ userId, name: 'test key', expiresAt });
  });

  test('revokes an API key owned by the authenticated user', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api-keys/${apiKeyId}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(apiKeyResponse);
    expect(service.revokeApiKey).toHaveBeenCalledWith({ userId, apiKeyId });
  });
});
