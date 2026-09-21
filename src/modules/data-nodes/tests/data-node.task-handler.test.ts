import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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

const now = new Date('2026-01-02T00:00:00.000Z');
const dataNodeId = 'data-node-1';
const certificateFingerprint = 'ab'.repeat(32);
const sessionId = '00000000-0000-4000-8000-000000000001';

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
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: 'master-node-a',
  epoch: 1n,
  sequence: 1n,
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
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme
    },
    storageTotalBytes: dataNode.storageTotalBytes,
    storageFreeBytes: dataNode.storageFreeBytes,
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
    expectedRevision: dataNode.revision
  }
};

const stateUpdateTask: UpdateDataNodeStateTask = {
  ...taskBase,
  type: 'data-node.update-state',
  data: {
    id: dataNodeId,
    state: 'offline',
    expectedRevision: dataNode.revision
  }
};

/* mocks */

const createRepositoryMock = (): jest.Mocked<DataNodeRepositoryContract> => {
  return {
    findById: jest.fn<DataNodeRepositoryContract['findById']>().mockResolvedValue(null),
    applyRegistration: jest.fn<DataNodeRepositoryContract['applyRegistration']>().mockResolvedValue(true),
    applyHeartbeat: jest.fn<DataNodeRepositoryContract['applyHeartbeat']>().mockResolvedValue(true),
    applyHealthCheck: jest.fn<DataNodeRepositoryContract['applyHealthCheck']>().mockResolvedValue(true),
    updateStateIfRevisionUnchanged: jest
      .fn<DataNodeRepositoryContract['updateStateIfRevisionUnchanged']>()
      .mockResolvedValue(true)
  } as unknown as jest.Mocked<DataNodeRepositoryContract>;
};

/* tests */

describe('DataNodeTaskHandler', () => {
  let repository: jest.Mocked<DataNodeRepositoryContract>;
  let handler: DataNodeTaskHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    handler = new DataNodeTaskHandler(repository);
  });

  test('applies a new registration and returns its session', async () => {
    await expect(handler.registerDataNode(registerTask)).resolves.toBe(sessionId);
    expect(repository.applyRegistration).toHaveBeenCalledWith(registerTask.data);
  });

  test('accepts a replay of an already completed registration', async () => {
    repository.findById.mockResolvedValue(dataNode);

    await expect(handler.registerDataNode(registerTask)).resolves.toBe(sessionId);
    expect(repository.applyRegistration).not.toHaveBeenCalled();
  });

  test('returns immediately when a heartbeat is applied', async () => {
    await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).resolves.toBe(true);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  test('accepts a heartbeat replay for the current certificate and session', async () => {
    repository.applyHeartbeat.mockResolvedValue(false);
    repository.findById.mockResolvedValue(dataNode);

    await expect(handler.applyDataNodeHeartbeat(heartbeatTask)).resolves.toBe(true);
  });

  test('accepts a health-check replay with the desired timestamp', async () => {
    repository.applyHealthCheck.mockResolvedValue(false);
    repository.findById.mockResolvedValue(dataNode);

    await expect(handler.recordDataNodeHealthCheck(healthCheckTask)).resolves.toBe(true);
  });

  test('accepts a state-update replay with the desired state', async () => {
    repository.updateStateIfRevisionUnchanged.mockResolvedValue(false);
    repository.findById.mockResolvedValue({
      ...dataNode,
      state: stateUpdateTask.data.state
    });

    await expect(handler.updateDataNodeState(stateUpdateTask)).resolves.toBe(true);
  });
});
