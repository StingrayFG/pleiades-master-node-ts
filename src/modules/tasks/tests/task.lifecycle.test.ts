import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAbortedError, GenericInternalServerError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import { TaskPayloadCleanupHandler } from '../lifecycle/task-payload-cleanup.handler';
import { TaskLifecycleHandler } from '../lifecycle/task.lifecycle-handler';
import { UncommittedTaskCleanupHandler } from '../lifecycle/uncommitted-task-cleanup.handler';
import type { TaskConfig } from '../task.config';
import type { PersistedTask } from '../task.domain';
import type { TaskRepositoryContract } from '../task.repository';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const config: TaskConfig = {
  applyBatchSize: 32,
  executionWaitTimeoutMs: 10_000,
  lifecycle: {
    uncommittedCleanup: { afterMs: 10_000, batchSize: 3 },
    payloadCleanup: { afterMs: 20_000, batchSize: 4 }
  }
};

const payloadTask: PersistedTask = {
  id: '00000000-0000-4000-8000-000000000001',

  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 1n,
  sequence: 1n,

  state: 'completed',

  revision: 0n,

  type: 'blob.ensure-exists',
  data: {},
  executionScope: 'cluster',

  payloadId: 'payload-1',

  createdAt: now,
  updatedAt: now
};

const uncommittedTask: PersistedTask = {
  ...payloadTask,
  id: '00000000-0000-4000-8000-000000000002',
  state: 'pending',
  payloadId: null
};

const consensusState: ConsensusState = {
  id: 'consensus-state',

  currentEpoch: 1n,
  leaderMasterId: 'master-node-aaaaaaaaaaaa',
  votedForMasterId: 'master-node-aaaaaaaaaaaa',
  lastLeaderContactAt: now,

  lastAllocatedSequence: 5n,
  lastMatchedSequence: 5n,
  lastCommittedSequence: 5n,
  lastAppliedSequence: 5n,

  createdAt: now,
  updatedAt: now,

  revision: 0n
};

/* mocks */

const createTaskRepositoryMock = (): jest.Mocked<TaskRepositoryContract> => {
  const repository = {
    listTasksInSequenceRange: jest.fn<TaskRepositoryContract['listTasksInSequenceRange']>(),
    listTasksFromSequence: jest.fn<TaskRepositoryContract['listTasksFromSequence']>(),
    listPayloadCleanupCandidates: jest.fn<TaskRepositoryContract['listPayloadCleanupCandidates']>(),
    listUncommittedCleanupCandidates: jest.fn<TaskRepositoryContract['listUncommittedCleanupCandidates']>(),
    listExecutionsByTaskId: jest.fn<TaskRepositoryContract['listExecutionsByTaskId']>(),
    findById: jest.fn<TaskRepositoryContract['findById']>(),
    findBySequence: jest.fn<TaskRepositoryContract['findBySequence']>(),
    create: jest.fn<TaskRepositoryContract['create']>(),
    createExecutions: jest.fn<TaskRepositoryContract['createExecutions']>(),
    markExecutionExecuting: jest.fn<TaskRepositoryContract['markExecutionExecuting']>(),
    markExecutionCompleted: jest.fn<TaskRepositoryContract['markExecutionCompleted']>(),
    markExecutionFailed: jest.fn<TaskRepositoryContract['markExecutionFailed']>(),
    updateTaskState: jest.fn<TaskRepositoryContract['updateTaskState']>(),
    clearPayloadId: jest.fn<TaskRepositoryContract['clearPayloadId']>(),
    truncateFromSequence: jest.fn<TaskRepositoryContract['truncateFromSequence']>()
  };

  repository.listPayloadCleanupCandidates.mockResolvedValue([]);
  repository.listUncommittedCleanupCandidates.mockResolvedValue([]);
  repository.updateTaskState.mockResolvedValue(uncommittedTask);
  repository.clearPayloadId.mockResolvedValue(true);

  return repository;
};

const createByteStorageServiceMock = (): jest.Mocked<ByteStorageServiceContract> => ({
  store: jest.fn<ByteStorageServiceContract['store']>(),
  retrieve: jest.fn<ByteStorageServiceContract['retrieve']>(),
  delete: jest.fn<ByteStorageServiceContract['delete']>()
});

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  const service = {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusServiceContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusServiceContract['advanceLastAppliedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    claimInitialLeadership: jest.fn<ConsensusServiceContract['claimInitialLeadership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

/* tests */

describe('TaskPayloadCleanupHandler', () => {
  let repository: jest.Mocked<TaskRepositoryContract>;
  let byteStorageService: jest.Mocked<ByteStorageServiceContract>;

  beforeEach(() => {
    repository = createTaskRepositoryMock();
    byteStorageService = createByteStorageServiceMock();
  });

  test('deletes payloads of aged terminal tasks and clears their references', async () => {
    repository.listPayloadCleanupCandidates.mockResolvedValue([payloadTask]);
    const handler = new TaskPayloadCleanupHandler(repository, byteStorageService, config);

    await handler.run(now);

    expect(repository.listPayloadCleanupCandidates).toHaveBeenCalledWith({
      updatedBefore: new Date(now.getTime() - config.lifecycle.payloadCleanup.afterMs),
      limit: config.lifecycle.payloadCleanup.batchSize
    });
    expect(byteStorageService.delete).toHaveBeenCalledWith(payloadTask.payloadId!);
    expect(repository.clearPayloadId).toHaveBeenCalledWith({
      id: payloadTask.id,
      revision: payloadTask.revision
    });
  });

  test('skips pending tasks and tasks without payloads', async () => {
    repository.listPayloadCleanupCandidates.mockResolvedValue([
      uncommittedTask,
      { ...payloadTask, id: '00000000-0000-4000-8000-000000000003', payloadId: null }
    ]);
    const handler = new TaskPayloadCleanupHandler(repository, byteStorageService, config);

    await handler.run(now);

    expect(byteStorageService.delete).not.toHaveBeenCalled();
    expect(repository.clearPayloadId).not.toHaveBeenCalled();
  });

  test('cleans the rest of the batch and aggregates per-task failures', async () => {
    const failingTask = { ...payloadTask, id: '00000000-0000-4000-8000-000000000004', payloadId: 'failing-payload' };
    const storageError = new GenericInternalServerError('Byte storage unavailable');

    repository.listPayloadCleanupCandidates.mockResolvedValue([failingTask, payloadTask]);
    byteStorageService.delete.mockRejectedValueOnce(storageError);

    const handler = new TaskPayloadCleanupHandler(repository, byteStorageService, config);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: failingTask.id, error: storageError }
    ]);
    expect(repository.clearPayloadId).toHaveBeenCalledTimes(1);
    expect(repository.clearPayloadId).toHaveBeenCalledWith({ id: payloadTask.id, revision: payloadTask.revision });
  });
});

describe('UncommittedTaskCleanupHandler', () => {
  let repository: jest.Mocked<TaskRepositoryContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;

  beforeEach(() => {
    repository = createTaskRepositoryMock();
    consensusService = createConsensusServiceMock();
  });

  test('fails stale uncommitted pending tasks', async () => {
    repository.listUncommittedCleanupCandidates.mockResolvedValue([uncommittedTask]);
    const handler = new UncommittedTaskCleanupHandler(repository, consensusService, config);

    await handler.run(now);

    expect(repository.listUncommittedCleanupCandidates).toHaveBeenCalledWith({
      afterSequence: consensusState.lastCommittedSequence,
      updatedBefore: new Date(now.getTime() - config.lifecycle.uncommittedCleanup.afterMs),
      limit: config.lifecycle.uncommittedCleanup.batchSize
    });
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: uncommittedTask.id,
      revision: uncommittedTask.revision,
      state: 'failed',
      at: now
    });
  });

  test('skips non-pending tasks', async () => {
    repository.listUncommittedCleanupCandidates.mockResolvedValue([payloadTask]);
    const handler = new UncommittedTaskCleanupHandler(repository, consensusService, config);

    await handler.run(now);

    expect(repository.updateTaskState).not.toHaveBeenCalled();
  });

  test('ignores aborted concurrent state changes', async () => {
    repository.listUncommittedCleanupCandidates.mockResolvedValue([uncommittedTask]);
    repository.updateTaskState.mockRejectedValue(new GenericAbortedError());
    const handler = new UncommittedTaskCleanupHandler(repository, consensusService, config);

    await expect(handler.run(now)).resolves.toBeUndefined();
  });

  test('cleans the rest of the batch and aggregates per-task failures', async () => {
    const failingTask = { ...uncommittedTask, id: '00000000-0000-4000-8000-000000000005' };
    const stateError = new GenericInternalServerError('Database unavailable');

    repository.listUncommittedCleanupCandidates.mockResolvedValue([failingTask, uncommittedTask]);
    repository.updateTaskState.mockRejectedValueOnce(stateError);

    const handler = new UncommittedTaskCleanupHandler(repository, consensusService, config);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([{ source: failingTask.id, error: stateError }]);
    expect(repository.updateTaskState).toHaveBeenCalledTimes(2);
  });
});

describe('TaskLifecycleHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs both cleanup handlers with the same current time', async () => {
    const uncommittedRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const payloadRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const handler = new TaskLifecycleHandler(
      { run: uncommittedRun } as unknown as UncommittedTaskCleanupHandler,
      { run: payloadRun } as unknown as TaskPayloadCleanupHandler
    );

    await handler.run();

    expect(uncommittedRun).toHaveBeenCalledWith(now);
    expect(payloadRun).toHaveBeenCalledWith(now);
  });

  test('runs both cleanup handlers and aggregates failures by lifecycle source', async () => {
    const uncommittedError = new Error('uncommitted cleanup failed');
    const payloadError = new Error('payload cleanup failed');
    const uncommittedRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(uncommittedError);
    const payloadRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(payloadError);
    const handler = new TaskLifecycleHandler(
      { run: uncommittedRun } as unknown as UncommittedTaskCleanupHandler,
      { run: payloadRun } as unknown as TaskPayloadCleanupHandler
    );

    let thrown: unknown;

    try {
      await handler.run();
    } catch (err) {
      thrown = err;
    }

    expect(uncommittedRun).toHaveBeenCalledWith(now);
    expect(payloadRun).toHaveBeenCalledWith(now);
    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: 'uncommittedCleanup', error: uncommittedError },
      { source: 'payloadCleanup', error: payloadError }
    ]);
  });
});
