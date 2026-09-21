import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericForbiddenError } from '@/errors/application.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { HeartbeatDataNodeInput, RegisterDataNodeInput } from '../data-node.application';
import { dataNodeSessionIdSchema, type DataNode, type DataNodeHealthSnapshot } from '../data-node.domain';
import type { DataNodeGrpcClientContract } from '../data-node.grpc-client';
import type { DataNodeRepositoryContract } from '../data-node.repository';
import { DataNodeService } from '../data-node.service';
import {
  applyDataNodeHeartbeatTaskDefinition,
  registerDataNodeTaskDefinition,
  type ApplyDataNodeHeartbeatTaskData,
  type RegisterDataNodeTaskData
} from '../data-node.tasks';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');
const dataNodeId = 'data-node-1';
const certificateFingerprint = 'ab'.repeat(32);
const sessionId = '00000000-0000-4000-8000-000000000001';

const healthSnapshot: DataNodeHealthSnapshot = {
  status: 'healthy',
  databaseOk: true,
  storageOk: true,
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  message: 'healthy'
};

const dataNode: DataNode = {
  id: dataNodeId,
  certificateFingerprint,
  sessionId,
  lastHeartbeatSequence: 2n,
  state: 'active',
  mode: 'serving',
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: now,
  updatedAt: now,
  revision: 3n
};

const registrationInput: RegisterDataNodeInput = {
  id: dataNodeId,
  certificateFingerprint,
  endpoint: {
    hostname: dataNode.hostname,
    port: dataNode.port,
    scheme: dataNode.scheme
  },
  healthSnapshot
};

const heartbeatInput: HeartbeatDataNodeInput = {
  id: dataNodeId,
  certificateFingerprint,
  sessionId,
  heartbeatSequence: 3n,
  healthSnapshot
};

/* mocks */

const createRepositoryMock = (): jest.Mocked<DataNodeRepositoryContract> => {
  return {
    listAvailable: jest.fn<DataNodeRepositoryContract['listAvailable']>().mockResolvedValue([]),
    findById: jest.fn<DataNodeRepositoryContract['findById']>().mockResolvedValue(null)
  } as unknown as jest.Mocked<DataNodeRepositoryContract>;
};

const createGrpcClientMock = (): jest.Mocked<DataNodeGrpcClientContract> => {
  return {
    checkDataNodeHealth: jest.fn<DataNodeGrpcClientContract['checkDataNodeHealth']>(),
    close: jest.fn<DataNodeGrpcClientContract['close']>()
  };
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>()
  } as unknown as jest.Mocked<TaskServiceContract>;
};

/* tests */

describe('DataNodeService', () => {
  let repository: jest.Mocked<DataNodeRepositoryContract>;
  let grpcClient: jest.Mocked<DataNodeGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: DataNodeService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createRepositoryMock();
    grpcClient = createGrpcClientMock();
    taskService = createTaskServiceMock();
    service = new DataNodeService(repository, grpcClient, taskService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lists available data nodes', async () => {
    repository.listAvailable.mockResolvedValue([dataNode]);

    await expect(service.listAvailableDataNodes()).resolves.toEqual([dataNode]);
  });

  test('submits a new registration with a generated session', async () => {
    const returnedSessionId = await service.registerDataNode(registrationInput);
    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    const taskData = data as RegisterDataNodeTaskData;

    expect(dataNodeSessionIdSchema.safeParse(returnedSessionId).success).toBe(true);
    expect(definition).toBe(registerDataNodeTaskDefinition);
    expect(taskData).toEqual({
      id: dataNodeId,
      certificateFingerprint,
      sessionId: returnedSessionId,
      state: 'joining',
      endpoint: registrationInput.endpoint,
      storageTotalBytes: healthSnapshot.storageTotalBytes,
      storageFreeBytes: healthSnapshot.storageFreeBytes,
      lastContactAt: now,
      expectedRevision: null
    });
  });

  test('rejects registration from a different certificate', async () => {
    repository.findById.mockResolvedValue(dataNode);

    await expect(
      service.registerDataNode({
        ...registrationInput,
        certificateFingerprint: 'cd'.repeat(32)
      })
    ).rejects.toBeInstanceOf(GenericForbiddenError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('ignores a duplicate heartbeat', async () => {
    repository.findById.mockResolvedValue(dataNode);

    await expect(
      service.applyDataNodeHeartbeat({
        ...heartbeatInput,
        heartbeatSequence: dataNode.lastHeartbeatSequence
      })
    ).resolves.toBeUndefined();
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('submits a newer heartbeat task', async () => {
    repository.findById.mockResolvedValue(dataNode);

    await service.applyDataNodeHeartbeat(heartbeatInput);

    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];

    expect(definition).toBe(applyDataNodeHeartbeatTaskDefinition);
    expect(data as ApplyDataNodeHeartbeatTaskData).toEqual({
      id: dataNodeId,
      certificateFingerprint,
      sessionId,
      heartbeatSequence: 3n,
      state: 'active',
      storageTotalBytes: healthSnapshot.storageTotalBytes,
      storageFreeBytes: healthSnapshot.storageFreeBytes,
      lastContactAt: now,
      lastHeartbeatAt: now
    });
  });

  test('checks health through the persisted endpoint', async () => {
    repository.findById.mockResolvedValue(dataNode);
    grpcClient.checkDataNodeHealth.mockResolvedValue(healthSnapshot);

    await expect(service.checkDataNodeHealth(dataNodeId)).resolves.toBe(healthSnapshot);
    expect(grpcClient.checkDataNodeHealth).toHaveBeenCalledWith({
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme
    });
  });
});
