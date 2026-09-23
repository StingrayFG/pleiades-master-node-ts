import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericNotFoundError,
  GenericResourceExhaustedError,
  GenericUnauthorizedError
} from '@/errors/application.errors';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import type { Object, ObjectVersion } from '../object.domain';
import { ObjectController } from '../object.http-controller';
import { createObjectHttpRoutes } from '../object.http-routes';
import type { ObjectServiceContract } from '../object.service';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const bucketId = '00000000-0000-4000-8000-000000000002';
const objectId = '00000000-0000-4000-8000-000000000003';
const bucketName = 'test-bucket';
const objectKey = 'path/to/object.txt';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const committedAt = new Date('2026-01-02T00:00:00.000Z');
const objectBytes = Buffer.from('abc');

const object: Object = {
  id: objectId,
  key: objectKey,
  bucketId,
  currentVersion: 1,
  lastAllocatedVersion: 1,
  createdAt,
  updatedAt: committedAt
};

const objectVersion: ObjectVersion = {
  objectId,
  version: 1,
  state: 'committed',
  totalSizeBytes: BigInt(objectBytes.length),
  contentType: 'application/octet-stream',
  createdAt,
  committedAt,
  updatedAt: committedAt
};

/* mocks */

const createObjectServiceMock = (): jest.Mocked<ObjectServiceContract> => {
  const service = {
    getObjectMetadata: jest.fn<ObjectServiceContract['getObjectMetadata']>(),
    getObject: jest.fn<ObjectServiceContract['getObject']>(),
    createObject: jest.fn<ObjectServiceContract['createObject']>()
  };

  service.getObjectMetadata.mockResolvedValue(objectVersion);
  service.getObject.mockResolvedValue({
    objectVersion,
    data: Readable.from([objectBytes])
  });
  service.createObject.mockResolvedValue({ object, objectVersion });

  return service;
};

const createTestApp = async (
  service: ObjectServiceContract,
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
    createObjectHttpRoutes({
      controller: new ObjectController(service)
    })
  );

  await app.ready();

  return app;
};

/* tests */

describe('object HTTP routes', () => {
  let app: FastifyInstance | undefined;
  let service: jest.Mocked<ObjectServiceContract>;

  beforeEach(() => {
    service = createObjectServiceMock();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('requires authentication', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'GET',
      url: `/${bucketName}/objects/${objectKey}`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
    expect(service.getObject).not.toHaveBeenCalled();
  });

  test('rejects invalid object route parameters before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/Invalid_Bucket/objects/${objectKey}`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('BAD_REQUEST');
    expect(service.getObject).not.toHaveBeenCalled();
  });

  test('streams an object with its metadata headers', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/${bucketName}/objects/${objectKey}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(objectBytes);
    expect(response.headers['content-length']).toBe(objectBytes.length.toString());
    expect(response.headers['content-type']).toBe(objectVersion.contentType);
    expect(response.headers['x-object-version']).toBe(objectVersion.version.toString());
    expect(response.headers['last-modified']).toBe(committedAt.toUTCString());
    expect(service.getObject).toHaveBeenCalledWith({ userId, bucketName, objectKey });
  });

  test('returns object metadata without a response body', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'HEAD',
      url: `/${bucketName}/objects/${objectKey}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers['content-length']).toBe(objectBytes.length.toString());
    expect(response.headers['content-type']).toBe(objectVersion.contentType);
    expect(response.headers['x-object-version']).toBe(objectVersion.version.toString());
    expect(response.headers['last-modified']).toBe(committedAt.toUTCString());
    expect(service.getObjectMetadata).toHaveBeenCalledWith({ userId, bucketName, objectKey });
  });

  test('passes the upload stream and parsed metadata to the object service', async () => {
    app = await createTestApp(service);
    let receivedBytes: Buffer | undefined;

    service.createObject.mockImplementation(async (input) => {
      receivedBytes = await buffer(input.data);

      return { object, objectVersion };
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/${bucketName}/objects/${objectKey}`,
      headers: {
        'content-length': objectBytes.length.toString(),
        'content-type': objectVersion.contentType
      },
      payload: objectBytes
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['x-object-version']).toBe(objectVersion.version.toString());
    expect(service.createObject).toHaveBeenCalledTimes(1);

    const serviceInput = service.createObject.mock.calls[0][0];

    expect(serviceInput).toMatchObject({
      userId,
      bucketName,
      objectKey,
      totalSizeBytes: BigInt(objectBytes.length),
      contentType: objectVersion.contentType
    });
    expect(serviceInput.data).toBeInstanceOf(Readable);
    expect(receivedBytes).toEqual(objectBytes);
  });

  test('rejects invalid upload headers before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/${bucketName}/objects/${objectKey}`,
      headers: {
        'content-length': 'invalid',
        'content-type': objectVersion.contentType
      },
      payload: objectBytes
    });

    expect(response.statusCode).toBe(400);
    expect(service.createObject).not.toHaveBeenCalled();
  });

  test('returns 404 when the requested object does not exist', async () => {
    app = await createTestApp(service);
    service.getObject.mockRejectedValue(new GenericNotFoundError('Object not found'));

    const response = await app.inject({
      method: 'GET',
      url: `/${bucketName}/objects/${objectKey}`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
  });

  test('returns 507 when object placement lacks sufficient storage', async () => {
    app = await createTestApp(service);
    service.createObject.mockRejectedValue(new GenericResourceExhaustedError('Insufficient storage'));

    const response = await app.inject({
      method: 'PUT',
      url: `/${bucketName}/objects/${objectKey}`,
      headers: {
        'content-length': objectBytes.length.toString(),
        'content-type': objectVersion.contentType
      },
      payload: objectBytes
    });

    expect(response.statusCode).toBe(507);
    expect(response.json().code).toBe('INSUFFICIENT_STORAGE');
  });
});
