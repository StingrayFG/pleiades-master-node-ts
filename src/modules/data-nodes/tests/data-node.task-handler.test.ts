import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericForbiddenError, GenericNotFoundError } from '@/errors/application.errors';

import type { DataNode } from '../data-node.domain';
import type { DataNodeRepositoryContract } from '../data-node.repository';
import { DataNodeTaskHandler } from '../data-node.task-handler';
import type {
  ApplyDataNodeHeartbeatTask,
  RecordDataNodeHealthCheckTask,
  RegisterDataNodeTask,
  UpdateDataNodeStateTask
} from '../data-node.tasks';

/* fixtures */

const dataNodeId = 'data-node-1';
const certificateFingerprint = 'ab'.repeat(32);
const sessionId = '00000000-0000-4000-8000-000000000001';
const taskId = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-01-02T00:00:00.000Z');

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
  lastHealthCheckAt: now,
  lastHeartbeatAt: now,
  updatedAt: now,

  revision: 3n
};

const taskBase = {
  id: taskId,

  originMasterNodeId: 'master-node-012345abcdef',
  epoch: 0n,
  sequence: 0n,

  state: 'pending',

  revision: 0n,

  executionScope: 'cluster'
} as const;

const registerTask: RegisterDataNodeTask = {
  ...taskBase,
  type: 'data-node.register',
  data: {
    id: dataNodeId,

    certificateFingerprint,
    sessionId,
    state: 'joining',

    endpoint: {
      hostname: 'data-node.internal',
      port: 50051,
      scheme: 'grpcs'
    },

    storageTotalBytes: 1_000n,
    storageFreeBytes: 400n,

    lastContactAt: now,

    expectedRevision: null
  }
};

const heartbeatTask: ApplyDataNodeHeartbeatTask = {
  ...taskBase,
  type: 'data-node.apply-heartbeat',
  data: {
    id: dataNodeId,

    certificateFingerprint,
    sessionId,
    heartbeatSequence: 3n,
    state: 'active',

    storageTotalBytes: 1_000n,
    storageFreeBytes: 350n,

    lastContactAt: now,
    lastHeartbeatAt: now
  }
};

const healthCheckTask: RecordDataNodeHealthCheckTask = {
  ...taskBase,
  type: 'data-node.record-health-check',
  data: {
    id: dataNodeId,
    lastHealthCheckAt: now,
    expectedRevision: 3n
  }
};

const stateUpdateTask: UpdateDataNodeStateTask = {
  ...taskBase,
  type: 'data-node.update-state',
  data: {
    id: dataNodeId,
    state: 'offline',
    expectedRevision: 3n
  }
};

/* mocks */

const createDataNodeRepositoryMock = (): jest.Mocked<DataNodeRepositoryContract> => {
  const repository = {
    listAll: jest.fn<DataNodeRepositoryContract['listAll']>(),
    listAvailable: jest.fn<DataNodeRepositoryContract['listAvailable']>(),
    findById: jest.fn<DataNodeRepositoryContract['findById']>(),
    applyRegistration: jest.fn<DataNodeRepositoryContract['applyRegistration']>(),
    applyHeartbeat: jest.fn<DataNodeRepositoryContract['applyHeartbeat']>(),
    applyHealthCheck: jest.fn<DataNodeRepositoryContract['applyHealthCheck']>(),
    updateStateIfRevisionUnchanged: jest.fn<DataNodeRepositoryContract['updateStateIfRevisionUnchanged']>()
  };

  repository.listAll.mockResolvedValue([]);
  repository.listAvailable.mockResolvedValue([]);
  repository.findById.mockResolvedValue(null);
  repository.applyRegistration.mockResolvedValue(true);
  repository.applyHeartbeat.mockResolvedValue(true);
  repository.applyHealthCheck.mockResolvedValue(true);
  repository.updateStateIfRevisionUnchanged.mockResolvedValue(true);

  return repository;
};

/* tests */

describe('DataNodeTaskHandler', () => {
  let repository: jest.Mocked<DataNodeRepositoryContract>;
  let handler: DataNodeTaskHandler;

  beforeEach(() => {
    repository = createDataNodeRepositoryMock();
    handler = new DataNodeTaskHandler(repository);
  });

  describe('registerDataNode', () => {
    test('applies a new registration and returns its session', async () => {
      await expect(handler.registerDataNode(registerTask)).resolves.toBe(sessionId);
      expect(repository.applyRegistration).toHaveBeenCalledWith(registerTask.data);
    });

    test('returns the session without applying an already completed registration', async () => {
      repository.findById.mockResolvedValue(dataNode);

      await expect(handler.registerDataNode(registerTask)).resolves.toBe(sessionId);
      expect(repository.applyRegistration).not.toHaveBeenCalled();
    });

    test('rejects registration when the current certificate differs', async () => {
      repository.findById.mockResolvedValue({
        ...dataNode,
        certificateFingerprint: 'cd'.repeat(32)
      });

      await expect(handler.registerDataNode(registerTask)).rejects.toBeInstanceOf(GenericForbiddenError);
      expect(repository.applyRegistration).not.toHaveBeenCalled();
    });

    test('reconciles a superseded apply when the desired session is present', async () => {
      repository.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(dataNode);
      repository.applyRegistration.mockResolvedValue(false);

      await expect(handler.registerDataNode(registerTask)).resolves.toBe(sessionId);
      expect(repository.findById).toHaveBeenCalledTimes(2);
    });

    test('rejects a superseded apply when the resulting certificate differs', async () => {
      repository.findById.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...dataNode,
        certificateFingerprint: 'cd'.repeat(32)
      });
      repository.applyRegistration.mockResolvedValue(false);

      await expect(handler.registerDataNode(registerTask)).rejects.toBeInstanceOf(GenericForbiddenError);
    });

    test('reports a conflict when another registration supersedes the desired session', async () => {
      repository.findById.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...dataNode,
        sessionId: '00000000-0000-4000-8000-000000000099'
      });
      repository.applyRegistration.mockResolvedValue(false);

      await expect(handler.registerDataNode(registerTask)).rejects.toBeInstanceOf(GenericConflictError);
    });
  });

  describe('applyDataNodeHeartbeat', () => {
    test('returns immediately when the heartbeat is applied', async () => {
      await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).resolves.toBe(true);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    test('accepts a replay when the current node still has the certificate and session', async () => {
      repository.applyHeartbeat.mockResolvedValue(false);
      repository.findById.mockResolvedValue(dataNode);

      await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).resolves.toBe(true);
    });

    test('rejects a replay when the data node no longer exists', async () => {
      repository.applyHeartbeat.mockResolvedValue(false);

      await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).rejects.toBeInstanceOf(GenericNotFoundError);
    });

    test('rejects a replay from a different certificate', async () => {
      repository.applyHeartbeat.mockResolvedValue(false);
      repository.findById.mockResolvedValue({
        ...dataNode,
        certificateFingerprint: 'cd'.repeat(32)
      });

      await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).rejects.toBeInstanceOf(GenericForbiddenError);
    });

    test('rejects a replay from a stale session', async () => {
      repository.applyHeartbeat.mockResolvedValue(false);
      repository.findById.mockResolvedValue({
        ...dataNode,
        sessionId: '00000000-0000-4000-8000-000000000099'
      });

      await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).rejects.toBeInstanceOf(GenericConflictError);
    });
  });

  describe('recordDataNodeHealthCheck', () => {
    test('returns true when the health check is applied', async () => {
      await expect(handler.recordDataNodeHealthCheck(healthCheckTask)).resolves.toBe(true);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    test('returns true when a replay finds the desired health-check timestamp', async () => {
      repository.applyHealthCheck.mockResolvedValue(false);
      repository.findById.mockResolvedValue(dataNode);

      await expect(handler.recordDataNodeHealthCheck(healthCheckTask)).resolves.toBe(true);
    });

    test('returns false when a replay does not find the desired health-check timestamp', async () => {
      repository.applyHealthCheck.mockResolvedValue(false);
      repository.findById.mockResolvedValue({
        ...dataNode,
        lastHealthCheckAt: new Date('2026-01-01T00:00:00.000Z')
      });

      await expect(handler.recordDataNodeHealthCheck(healthCheckTask)).resolves.toBe(false);
    });
  });

  describe('updateDataNodeState', () => {
    test('returns true when the state update is applied', async () => {
      await expect(handler.updateDataNodeState(stateUpdateTask)).resolves.toBe(true);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    test('returns true when a replay finds the desired state', async () => {
      repository.updateStateIfRevisionUnchanged.mockResolvedValue(false);
      repository.findById.mockResolvedValue({
        ...dataNode,
        state: 'offline'
      });

      await expect(handler.updateDataNodeState(stateUpdateTask)).resolves.toBe(true);
    });

    test('returns false when a replay does not find the desired state', async () => {
      repository.updateStateIfRevisionUnchanged.mockResolvedValue(false);
      repository.findById.mockResolvedValue(dataNode);

      await expect(handler.updateDataNodeState(stateUpdateTask)).resolves.toBe(false);
    });
  });
});
