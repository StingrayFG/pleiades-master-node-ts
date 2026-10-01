import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericFailedPreconditionError,
  GenericNotFoundError,
  GenericUnauthorizedError
} from '@/errors/application.errors';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import type { MasterNode } from '../master-node.domain';
import { MasterNodeController } from '../master-node.http-controller';
import { createMasterNodeHttpRoutes } from '../master-node.http-routes';
import type { MasterNodeServiceContract } from '../master-node.service';

/* fixtures */

const masterNode: MasterNode = {
  id: 'master-node-012345abcdef',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs',

  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt: new Date('2026-01-02T00:00:00.000Z'),
  lastHealthCheckAt: null,
  lastHeartbeatAt: new Date('2026-01-02T00:01:00.000Z'),
  updatedAt: new Date('2026-01-02T00:01:00.000Z'),

  revision: 1n
};

const masterNodeResponse = {
  id: masterNode.id,

  certificateFingerprint: masterNode.certificateFingerprint,
  sessionId: masterNode.sessionId,
  state: masterNode.state,
  mode: masterNode.mode,

  hostname: masterNode.hostname,
  port: masterNode.port,
  scheme: masterNode.scheme,

  registeredAt: masterNode.registeredAt.toISOString(),
  lastContactAt: masterNode.lastContactAt.toISOString(),
  lastHealthCheckAt: null,
  lastHeartbeatAt: masterNode.lastHeartbeatAt?.toISOString() ?? null,
  updatedAt: masterNode.updatedAt.toISOString(),

  revision: masterNode.revision.toString()
};

/* mocks */

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  const service = {
    listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>(),
    getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>(),
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>(),
    transitionMasterNodeMode: jest.fn<MasterNodeServiceContract['transitionMasterNodeMode']>()
  };

  service.listMasterNodes.mockResolvedValue([]);
  service.getMasterNodeById.mockResolvedValue(masterNode);
  service.registerMasterNode.mockResolvedValue(masterNode);
  service.transitionMasterNodeMode.mockResolvedValue(masterNode);

  return service;
};

const createTestApp = async (
  service: MasterNodeServiceContract,
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
    createMasterNodeHttpRoutes({
      controller: new MasterNodeController(service)
    }),
    {
      prefix: '/internal/master-nodes'
    }
  );

  await app.ready();

  return app;
};

/* tests */

describe('master node HTTP routes', () => {
  let app: FastifyInstance | undefined;
  let service: jest.Mocked<MasterNodeServiceContract>;

  beforeEach(() => {
    service = createMasterNodeServiceMock();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('requires admin authentication', async () => {
    app = await createTestApp(service, { authenticated: false });

    const response = await app.inject({
      method: 'GET',
      url: '/internal/master-nodes/'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
    expect(service.listMasterNodes).not.toHaveBeenCalled();
  });

  test('lists master nodes', async () => {
    app = await createTestApp(service);
    service.listMasterNodes.mockResolvedValue([masterNode]);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/master-nodes/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([masterNodeResponse]);
    expect(service.listMasterNodes).toHaveBeenCalledWith();
  });

  test('gets a master node by id', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/internal/master-nodes/${masterNode.id}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(masterNodeResponse);
    expect(service.getMasterNodeById).toHaveBeenCalledWith(masterNode.id);
  });

  test('returns not found when the master node does not exist', async () => {
    app = await createTestApp(service);
    service.getMasterNodeById.mockRejectedValue(new GenericNotFoundError('Master node not found'));

    const response = await app.inject({
      method: 'GET',
      url: `/internal/master-nodes/${masterNode.id}`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
  });

  test('sets a master node mode', async () => {
    app = await createTestApp(service);
    const drainingMasterNode: MasterNode = {
      ...masterNode,
      mode: 'draining',
      revision: 2n
    };
    service.transitionMasterNodeMode.mockResolvedValue(drainingMasterNode);

    const response = await app.inject({
      method: 'PUT',
      url: `/internal/master-nodes/${masterNode.id}/mode`,
      payload: {
        mode: 'draining'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...masterNodeResponse,
      mode: 'draining',
      revision: '2'
    });
    expect(service.transitionMasterNodeMode).toHaveBeenCalledWith(masterNode.id, 'draining');
  });

  test('rejects an invalid master node mode before calling the service', async () => {
    app = await createTestApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/internal/master-nodes/${masterNode.id}/mode`,
      payload: {
        mode: 'offline'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('BAD_REQUEST');
    expect(service.transitionMasterNodeMode).not.toHaveBeenCalled();
  });

  test('returns conflict when a follower receives a mode change', async () => {
    app = await createTestApp(service);
    service.transitionMasterNodeMode.mockRejectedValue(
      new GenericFailedPreconditionError('This node is not the cluster leader')
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/internal/master-nodes/${masterNode.id}/mode`,
      payload: {
        mode: 'draining'
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
  });
});
