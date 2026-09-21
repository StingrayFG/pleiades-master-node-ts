import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericConflictError,
  GenericNotFoundError,
  GenericUnauthorizedError,
  GenericUnavailableError
} from '@/errors/application.errors';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import type { Bucket } from '../bucket.domain';
import { BucketController } from '../bucket.http-controller';
import { createBucketHttpRoutes } from '../bucket.http-routes';
import type { BucketServiceContract } from '../bucket.service';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const bucketName = 'test-bucket';

const bucket: Bucket = {
  id: '00000000-0000-4000-8000-000000000002',
  name: bucketName,

  userId,

  state: 'active',

  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),

  revision: 0n
};

const bucketResponse = {
  name: bucketName,
  state: 'active',
  createdAt: bucket.createdAt.toISOString(),
  updatedAt: bucket.updatedAt.toISOString()
};

/* mocks */

const createBucketServiceMock = (): jest.Mocked<BucketServiceContract> => {
  const service = {
    listBuckets: jest.fn<BucketServiceContract['listBuckets']>(),
    getBucketByName: jest.fn<BucketServiceContract['getBucketByName']>(),
    ensureBucketExists: jest.fn<BucketServiceContract['ensureBucketExists']>(),
    deleteBucket: jest.fn<BucketServiceContract['deleteBucket']>()
  };

  service.listBuckets.mockResolvedValue([]);
  service.getBucketByName.mockResolvedValue(bucket);
  service.ensureBucketExists.mockResolvedValue({
    bucket,
    status: 'existing'
  });
  service.deleteBucket.mockResolvedValue(bucket);

  return service;
};

const createTestApp = async (
  service: BucketServiceContract,
  { authenticated = true }: { authenticated?: boolean } = {}
): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
    createBucketHttpRoutes({
      controller: new BucketController(service)
    }),
    {
      prefix: '/buckets'
    }
  );

  await app.ready();

  return app;
};

/* tests */

describe('bucket HTTP routes', () => {
  let app: FastifyInstance | undefined;
  let service: jest.Mocked<BucketServiceContract>;

  beforeEach(() => {
    service = createBucketServiceMock();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('requires authentication', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'GET',
      url: '/buckets/'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
    expect(service.listBuckets).not.toHaveBeenCalled();
  });

  test('rejects an invalid bucket name before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'GET',
      url: '/buckets/Invalid_Bucket'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('BAD_REQUEST');
    expect(service.getBucketByName).not.toHaveBeenCalled();
  });

  test('lists buckets owned by the authenticated user', async () => {
    app = await createTestApp(service);

    service.listBuckets.mockResolvedValue([bucket]);

    const response = await app.inject({
      method: 'GET',
      url: '/buckets/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([bucketResponse]);
    expect(service.listBuckets).toHaveBeenCalledWith(userId);
  });

  test('returns 503 when bucket storage is unavailable', async () => {
    app = await createTestApp(service);

    service.listBuckets.mockRejectedValue(new GenericUnavailableError('Bucket storage is unavailable'));

    const response = await app.inject({
      method: 'GET',
      url: '/buckets/'
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('SERVICE_UNAVAILABLE');
  });

  test('gets a bucket by name for the authenticated user', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(bucketResponse);
    expect(service.getBucketByName).toHaveBeenCalledWith(userId, bucketName);
  });

  test('returns 404 when the requested bucket does not exist', async () => {
    app = await createTestApp(service);

    service.getBucketByName.mockRejectedValue(new GenericNotFoundError('Bucket not found'));

    const response = await app.inject({
      method: 'GET',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
  });

  test('returns 201 when a bucket is created', async () => {
    app = await createTestApp(service);

    service.ensureBucketExists.mockResolvedValue({
      bucket,
      status: 'created'
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(bucketResponse);
    expect(service.ensureBucketExists).toHaveBeenCalledWith(userId, bucketName);
  });

  test('returns 200 when a bucket already exists', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(bucketResponse);
  });

  test('returns 409 when bucket creation conflicts with existing state', async () => {
    app = await createTestApp(service);

    service.ensureBucketExists.mockRejectedValue(new GenericConflictError('Bucket creation conflict'));

    const response = await app.inject({
      method: 'PUT',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
  });

  test('deletes a bucket owned by the authenticated user', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'DELETE',
      url: `/buckets/${bucketName}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(bucketResponse);
    expect(service.deleteBucket).toHaveBeenCalledWith(userId, bucketName);
  });
});
