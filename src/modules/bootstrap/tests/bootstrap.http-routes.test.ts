import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericUnauthorizedError } from '@/errors/application.errors';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import { BootstrapController } from '../bootstrap.http-controller';
import { createBootstrapHttpRoutes } from '../bootstrap.http-routes';
import type { BootstrapServiceContract } from '../bootstrap.service';

/* fixtures */

const leaderMasterId = 'master-node-aaaaaaaaaaaa';
const leaderCertificateFingerprint = 'ab'.repeat(32);

const leaderResult = {
  role: 'leader',
  epoch: 3n,
  leaderMasterId
} as const;

const followerResult = {
  role: 'follower',
  epoch: 4n,
  leaderMasterId
} as const;

/* mocks */

const createBootstrapServiceMock = (): jest.Mocked<BootstrapServiceContract> => {
  return {
    bootstrapAsLeader: jest.fn<BootstrapServiceContract['bootstrapAsLeader']>().mockResolvedValue(leaderResult),
    bootstrapAsFollower: jest.fn<BootstrapServiceContract['bootstrapAsFollower']>().mockResolvedValue(followerResult)
  };
};

const createTestApp = async (
  service: BootstrapServiceContract,
  { authenticated = true }: { authenticated?: boolean } = {}
): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('adminAuthMW', async () => {
    if (!authenticated) {
      throw new GenericUnauthorizedError('Invalid admin token');
    }
  });

  app.register(errorHandlerPlugin);
  app.register(
    createBootstrapHttpRoutes({
      controller: new BootstrapController(service)
    }),
    {
      prefix: '/internal/bootstrap'
    }
  );

  await app.ready();

  return app;
};

/* tests */

describe('bootstrap HTTP routes', () => {
  let app: FastifyInstance | undefined;
  let service: jest.Mocked<BootstrapServiceContract>;

  beforeEach(() => {
    service = createBootstrapServiceMock();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('requires admin authentication', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'POST',
      url: '/internal/bootstrap/leader'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
    expect(service.bootstrapAsLeader).not.toHaveBeenCalled();
  });

  test('bootstraps the local master as leader', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/bootstrap/leader'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      role: 'leader',
      epoch: '3',
      leaderMasterId
    });
    expect(service.bootstrapAsLeader).toHaveBeenCalledWith();
  });

  test('maps a follower request to the service input', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/bootstrap/follower',
      payload: {
        leaderEndpoint: {
          hostname: 'master-node.internal',
          port: 4410
        },
        leaderCertificateFingerprint
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      role: 'follower',
      epoch: '4',
      leaderMasterId
    });
    expect(service.bootstrapAsFollower).toHaveBeenCalledWith({
      leaderEndpoint: {
        hostname: 'master-node.internal',
        port: 4410,
        scheme: 'grpcs'
      },
      leaderCertificateFingerprint
    });
  });

  test('rejects an invalid follower request before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/bootstrap/follower',
      payload: {
        leaderEndpoint: {
          hostname: '',
          port: 0
        },
        leaderCertificateFingerprint: 'invalid'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('BAD_REQUEST');
    expect(service.bootstrapAsFollower).not.toHaveBeenCalled();
  });

  test('returns conflict when bootstrap is incompatible with current state', async () => {
    app = await createTestApp(service);
    service.bootstrapAsLeader.mockRejectedValue(new GenericConflictError('Another leader exists'));

    const response = await app.inject({
      method: 'POST',
      url: '/internal/bootstrap/leader'
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
  });
});
