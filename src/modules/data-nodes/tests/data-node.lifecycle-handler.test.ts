import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { InternodeUnavailableError } from '@/errors/internode.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { dataNodeConfig } from '../data-node.config';
import type { DataNode, DataNodeHealthSnapshot } from '../data-node.domain';
import type { DataNodeGrpcClientContract } from '../data-node.grpc-client';
import type { DataNodeRepositoryContract } from '../data-node.repository';
import {
  recordDataNodeHealthCheckTaskDefinition,
  updateDataNodeStateTaskDefinition,
  type RecordDataNodeHealthCheckTaskData,
  type UpdateDataNodeStateTaskData
} from '../data-node.tasks';
import { DataNodeLifecycleHandler } from '../lifecycle/data-node.lifecycle-handler';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const dataNode: DataNode = {
  id: 'data-node-1',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
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

const healthSnapshot: DataNodeHealthSnapshot = {
  status: 'healthy',
  databaseOk: true,
  storageOk: true,
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  message: 'healthy'
};

const subtractMilliseconds = (date: Date, milliseconds: number): Date => {
  return new Date(date.getTime() - milliseconds);
};

/* mocks */

const createDataNodeRepositoryMock = (): jest.Mocked<DataNodeRepositoryContract> => {
  const repository = {
    listAll: jest.fn<DataNodeRepositoryContract['listAll']>(),
    listAvailable: jest.fn<DataNodeRepositoryContract['listAvailable']>(),
    findById: jest.fn<DataNodeRepositoryContract['findById']>(),
    findMemberById: jest.fn<DataNodeRepositoryContract['findMemberById']>(),
    applyRegistration: jest.fn<DataNodeRepositoryContract['applyRegistration']>(),
    applyHeartbeat: jest.fn<DataNodeRepositoryContract['applyHeartbeat']>(),
    applyHealthCheck: jest.fn<DataNodeRepositoryContract['applyHealthCheck']>(),
    updateStateIfRevisionUnchanged: jest.fn<DataNodeRepositoryContract['updateStateIfRevisionUnchanged']>()
  };

  repository.listAll.mockResolvedValue([]);

  return repository;
};

const createDataNodeGrpcClientMock = (): jest.Mocked<DataNodeGrpcClientContract> => {
  const grpcClient = {
    checkDataNodeHealth: jest.fn<DataNodeGrpcClientContract['checkDataNodeHealth']>(),
    close: jest.fn<DataNodeGrpcClientContract['close']>()
  };

  grpcClient.checkDataNodeHealth.mockResolvedValue(healthSnapshot);

  return grpcClient;
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  const taskService = {
    getTaskById: jest.fn<TaskServiceContract['getTaskById']>(),
    registerHandler: jest.fn<TaskServiceContract['registerHandler']>(),
    submitTask: jest.fn<TaskServiceContract['submitTask']>(),
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>(),
    executeTaskByDefinitionAndTargets: jest.fn<TaskServiceContract['executeTaskByDefinitionAndTargets']>()
  } as unknown as jest.Mocked<TaskServiceContract>;

  taskService.executeTaskByDefinition.mockResolvedValue(true);

  return taskService;
};

/* tests */

describe('DataNodeLifecycleHandler', () => {
  let repository: jest.Mocked<DataNodeRepositoryContract>;
  let grpcClient: jest.Mocked<DataNodeGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let handler: DataNodeLifecycleHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createDataNodeRepositoryMock();
    grpcClient = createDataNodeGrpcClientMock();
    taskService = createTaskServiceMock();
    handler = new DataNodeLifecycleHandler(repository, grpcClient, taskService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does nothing when there are no data nodes', async () => {
    await handler.run();

    expect(repository.listAll).toHaveBeenCalledWith();
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    expect(grpcClient.checkDataNodeHealth).not.toHaveBeenCalled();
  });

  test('does nothing when a recently contacted node keeps its state', async () => {
    repository.listAll.mockResolvedValue([dataNode]);

    await handler.run();

    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    expect(grpcClient.checkDataNodeHealth).not.toHaveBeenCalled();
  });

  test('marks a silent data node offline without a health check before the health threshold', async () => {
    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.offlineAfterMs)
      }
    ]);

    await handler.run();

    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(updateDataNodeStateTaskDefinition, {
      id: dataNode.id,
      state: 'offline',
      expectedRevision: dataNode.revision
    } satisfies UpdateDataNodeStateTaskData);
    expect(grpcClient.checkDataNodeHealth).not.toHaveBeenCalled();
  });

  test('stops processing when the health-check task loses its revision race', async () => {
    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      }
    ]);
    taskService.executeTaskByDefinition.mockResolvedValue(false);

    await handler.run();

    expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(1);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(recordDataNodeHealthCheckTaskDefinition, {
      id: dataNode.id,
      lastHealthCheckAt: now,
      expectedRevision: dataNode.revision
    } satisfies RecordDataNodeHealthCheckTaskData);
    expect(grpcClient.checkDataNodeHealth).not.toHaveBeenCalled();
  });

  test('records health before marking a healthy but silent node offline', async () => {
    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      }
    ]);

    await handler.run();

    expect(grpcClient.checkDataNodeHealth).toHaveBeenCalledWith({
      hostname: 'data-node.internal',
      port: 50051,
      scheme: 'grpcs'
    });
    expect(taskService.executeTaskByDefinition).toHaveBeenNthCalledWith(2, updateDataNodeStateTaskDefinition, {
      id: dataNode.id,
      state: 'offline',
      expectedRevision: dataNode.revision + 1n
    } satisfies UpdateDataNodeStateTaskData);
  });

  test('marks a silent unhealthy node failed after recording health', async () => {
    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      }
    ]);
    grpcClient.checkDataNodeHealth.mockResolvedValue({
      ...healthSnapshot,
      databaseOk: false
    });

    await handler.run();

    expect(taskService.executeTaskByDefinition).toHaveBeenNthCalledWith(2, updateDataNodeStateTaskDefinition, {
      id: dataNode.id,
      state: 'failed',
      expectedRevision: dataNode.revision + 1n
    } satisfies UpdateDataNodeStateTaskData);
  });

  test('marks a silent node failed when its internode health request fails', async () => {
    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      }
    ]);
    grpcClient.checkDataNodeHealth.mockRejectedValue(new InternodeUnavailableError('Data node unavailable'));

    await handler.run();

    expect(taskService.executeTaskByDefinition).toHaveBeenNthCalledWith(2, updateDataNodeStateTaskDefinition, {
      id: dataNode.id,
      state: 'failed',
      expectedRevision: dataNode.revision + 1n
    } satisfies UpdateDataNodeStateTaskData);
  });

  test('propagates unexpected health-check failures', async () => {
    const healthError = new Error('Unexpected health failure');

    repository.listAll.mockResolvedValue([
      {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      }
    ]);
    grpcClient.checkDataNodeHealth.mockRejectedValue(healthError);

    await expect(handler.run()).rejects.toBe(healthError);
  });
});
