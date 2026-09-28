import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericConflictError,
  GenericForbiddenError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
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

const dataNodeId = 'data-node-1';
const certificateFingerprint = 'ab'.repeat(32);
const sessionId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-01-02T00:00:00.000Z');

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
    hostname: 'data-node.internal',
    port: 50051,
    scheme: 'grpcs'
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
  repository.listAvailable.mockResolvedValue([]);
  repository.findById.mockResolvedValue(null);
  repository.findMemberById.mockResolvedValue(null);
  repository.applyRegistration.mockResolvedValue(true);
  repository.applyHeartbeat.mockResolvedValue(true);
  repository.applyHealthCheck.mockResolvedValue(true);
  repository.updateStateIfRevisionUnchanged.mockResolvedValue(true);

  return repository;
};

const createDataNodeGrpcClientMock = (): jest.Mocked<DataNodeGrpcClientContract> => {
  return {
    checkDataNodeHealth: jest.fn<DataNodeGrpcClientContract['checkDataNodeHealth']>(),
    close: jest.fn<DataNodeGrpcClientContract['close']>()
  };
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

describe('DataNodeService', () => {
  let repository: jest.Mocked<DataNodeRepositoryContract>;
  let grpcClient: jest.Mocked<DataNodeGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: DataNodeService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createDataNodeRepositoryMock();
    grpcClient = createDataNodeGrpcClientMock();
    taskService = createTaskServiceMock();
    service = new DataNodeService(repository, grpcClient, taskService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lists available data nodes', async () => {
    const dataNodes = [dataNode];

    repository.listAvailable.mockResolvedValue(dataNodes);

    await expect(service.listAvailableDataNodes()).resolves.toBe(dataNodes);
    expect(repository.listAvailable).toHaveBeenCalledWith();
  });

  test('returns a data node found by id', async () => {
    repository.findMemberById.mockResolvedValue(dataNode);

    await expect(service.getDataNodeById(dataNodeId)).resolves.toBe(dataNode);
    expect(repository.findMemberById).toHaveBeenCalledWith(dataNodeId);
  });

  test('throws when a data node cannot be found', async () => {
    await expect(service.getDataNodeById(dataNodeId)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  describe('registerDataNode', () => {
    test('submits a new registration with a generated session', async () => {
      taskService.executeTaskByDefinition.mockResolvedValue(sessionId);

      const result = await service.registerDataNode(registrationInput);

      expect(dataNodeSessionIdSchema.safeParse(result).success).toBe(true);
      expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(1);

      const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
      const taskData = data as RegisterDataNodeTaskData;

      expect(definition).toBe(registerDataNodeTaskDefinition);
      expect(taskData).toEqual({
        id: dataNodeId,

        certificateFingerprint,
        sessionId: result,
        state: 'joining',

        endpoint: registrationInput.endpoint,

        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,

        lastContactAt: now,

        expectedRevision: null
      });
    });

    test('uses the current revision when refreshing a registered data node', async () => {
      repository.findById.mockResolvedValue(dataNode);
      taskService.executeTaskByDefinition.mockResolvedValue(sessionId);

      await service.registerDataNode(registrationInput);

      const taskData = taskService.executeTaskByDefinition.mock.calls[0][1] as RegisterDataNodeTaskData;

      expect(taskData.expectedRevision).toBe(dataNode.revision);
      expect(taskData.sessionId).not.toBe(dataNode.sessionId);
    });

    test('generates a different session for each registration request', async () => {
      taskService.executeTaskByDefinition.mockResolvedValue(sessionId);

      await service.registerDataNode(registrationInput);
      await service.registerDataNode(registrationInput);

      const firstTaskData = taskService.executeTaskByDefinition.mock.calls[0][1] as RegisterDataNodeTaskData;
      const secondTaskData = taskService.executeTaskByDefinition.mock.calls[1][1] as RegisterDataNodeTaskData;

      expect(firstTaskData.sessionId).not.toBe(secondTaskData.sessionId);
    });

    test('rejects registration from a different certificate', async () => {
      repository.findById.mockResolvedValue(dataNode);

      const conflictingInput: RegisterDataNodeInput = {
        ...registrationInput,
        certificateFingerprint: 'cd'.repeat(32)
      };

      await expect(service.registerDataNode(conflictingInput)).rejects.toBeInstanceOf(GenericForbiddenError);
      expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    });

    test('propagates registration task failures', async () => {
      const taskError = new GenericInternalServerError('Task execution failed');

      taskService.executeTaskByDefinition.mockRejectedValue(taskError);

      await expect(service.registerDataNode(registrationInput)).rejects.toBe(taskError);
    });
  });

  describe('applyDataNodeHeartbeat', () => {
    test('rejects a heartbeat for an unknown data node', async () => {
      await expect(service.applyDataNodeHeartbeat(heartbeatInput)).rejects.toBeInstanceOf(GenericNotFoundError);
      expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    });

    test('rejects a heartbeat from a different certificate', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);

      const conflictingInput: HeartbeatDataNodeInput = {
        ...heartbeatInput,
        certificateFingerprint: 'cd'.repeat(32)
      };

      await expect(service.applyDataNodeHeartbeat(conflictingInput)).rejects.toBeInstanceOf(GenericForbiddenError);
      expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    });

    test('rejects a heartbeat from a stale session', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);

      const staleInput: HeartbeatDataNodeInput = {
        ...heartbeatInput,
        sessionId: '00000000-0000-4000-8000-000000000099'
      };

      await expect(service.applyDataNodeHeartbeat(staleInput)).rejects.toBeInstanceOf(GenericConflictError);
      expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    });

    test('ignores a duplicate or out-of-order heartbeat', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);

      await expect(
        service.applyDataNodeHeartbeat({
          ...heartbeatInput,
          heartbeatSequence: dataNode.lastHeartbeatSequence
        })
      ).resolves.toBeUndefined();
      expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
    });

    test('submits a newer heartbeat with its resolved state and timestamps', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);
      taskService.executeTaskByDefinition.mockResolvedValue(true);

      await service.applyDataNodeHeartbeat(heartbeatInput);

      expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(1);

      const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];

      expect(definition).toBe(applyDataNodeHeartbeatTaskDefinition);
      expect(data as ApplyDataNodeHeartbeatTaskData).toEqual({
        id: dataNodeId,

        certificateFingerprint,
        sessionId,
        heartbeatSequence: 3n,
        state: 'active',

        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,

        lastContactAt: now,
        lastHeartbeatAt: now
      });
    });

    test('records a failed state from an unhealthy snapshot', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);
      taskService.executeTaskByDefinition.mockResolvedValue(true);

      await service.applyDataNodeHeartbeat({
        ...heartbeatInput,
        healthSnapshot: {
          ...healthSnapshot,
          databaseOk: false
        }
      });

      const taskData = taskService.executeTaskByDefinition.mock.calls[0][1] as ApplyDataNodeHeartbeatTaskData;

      expect(taskData.state).toBe('failed');
    });
  });

  describe('checkDataNodeHealth', () => {
    test('checks health using the persisted data node endpoint', async () => {
      repository.findMemberById.mockResolvedValue(dataNode);
      grpcClient.checkDataNodeHealth.mockResolvedValue(healthSnapshot);

      await expect(service.checkDataNodeHealth(dataNodeId)).resolves.toBe(healthSnapshot);
      expect(grpcClient.checkDataNodeHealth).toHaveBeenCalledWith({
        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs'
      });
    });

    test('throws before checking health when the data node does not exist', async () => {
      await expect(service.checkDataNodeHealth(dataNodeId)).rejects.toBeInstanceOf(GenericNotFoundError);
      expect(grpcClient.checkDataNodeHealth).not.toHaveBeenCalled();
    });
  });
});
