import { Buffer } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import { GenericAbortedError, GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import { TaskApplyHandler } from '../task.apply-handler';
import type { TaskConfig } from '../task.config';
import { createDehydratedTaskDefinition, createTaskDefinition } from '../task.definition';
import type { TaskDefinition, TaskDefinitionHandler } from '../task.definition';
import type { PersistedTask, TaskExecution } from '../task.domain';
import type { TaskHandlerRegistryContract } from '../task.handler-registry';
import type { TaskRepositoryContract } from '../task.repository';
import type { TaskResultWaiterContract } from '../task.result-waiter';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');
const selfMasterNodeId = 'master-node-test';

const config: TaskConfig = {
  applyBatchSize: 32,
  executionWaitTimeoutMs: 10_000,
  lifecycle: {
    uncommittedCleanup: { afterMs: 10_000, batchSize: 3 },
    payloadCleanup: { afterMs: 20_000, batchSize: 4 }
  }
};

const task: PersistedTask = {
  id: '00000000-0000-4000-8000-000000000001',
  originMasterNodeId: selfMasterNodeId,
  epoch: 2n,
  sequence: 6n,
  state: 'pending',
  revision: 0n,
  type: 'test.execute',
  data: { value: 'test' },
  executionScope: 'local',
  payloadId: null,
  createdAt: now,
  updatedAt: now
};

const pendingExecution: TaskExecution = {
  id: '00000000-0000-4000-8000-000000000002',
  taskId: task.id,
  targetMasterId: selfMasterNodeId,
  state: 'pending',
  failureReason: null,
  createdAt: now,
  startedAt: null,
  completedAt: null,
  updatedAt: now,
  revision: 0n
};

const executingExecution: TaskExecution = {
  ...pendingExecution,
  state: 'executing',
  startedAt: now,
  revision: 1n
};

const completedExecution: TaskExecution = {
  ...executingExecution,
  state: 'completed',
  completedAt: now,
  revision: 2n
};

const failedExecution: TaskExecution = {
  ...executingExecution,
  state: 'failed',
  failureReason: 'handler failed',
  revision: 2n
};

const anotherPendingExecution: TaskExecution = {
  ...pendingExecution,
  id: '00000000-0000-4000-8000-000000000010'
};

const anotherCompletedExecution: TaskExecution = {
  ...completedExecution,
  id: '00000000-0000-4000-8000-000000000010'
};

const consensusState: ConsensusState = {
  id: 'self',
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,
  lastAllocatedSequence: 6n,
  lastMatchedSequence: 6n,
  lastCommittedSequence: 6n,
  lastAppliedSequence: 5n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const definition = createTaskDefinition({
  type: 'test.execute',
  dataSchema: z.object({ value: z.string() }),
  executionScope: 'local',
  resultSchema: z.string()
});

const dehydratedDefinition = createDehydratedTaskDefinition({
  type: 'test.dehydrated',
  dataSchema: z.object({ name: z.string(), bytes: z.instanceof(Buffer) }),
  persistedDataSchema: z.object({ name: z.string() }),
  executionScope: 'local',
  dehydrateData: ({ name, bytes }) => ({ data: { name }, payload: bytes }),
  hydrateData: (data, payload) => ({ ...data, bytes: payload }),
  resultSchema: z.string()
});

/* mocks */

const createRepositoryMock = (): jest.Mocked<TaskRepositoryContract> => {
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
    clearPayloadId: jest.fn<TaskRepositoryContract['clearPayloadId']>()
  };

  repository.listTasksInSequenceRange.mockResolvedValue([]);
  repository.listExecutionsByTaskId.mockResolvedValue([]);
  repository.createExecutions.mockResolvedValue([pendingExecution]);
  repository.markExecutionExecuting.mockResolvedValue(executingExecution);
  repository.markExecutionCompleted.mockResolvedValue(completedExecution);
  repository.markExecutionFailed.mockResolvedValue(failedExecution);
  repository.updateTaskState.mockResolvedValue(task);

  return repository;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  const service = {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusServiceContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusServiceContract['advanceLastAppliedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    claimInitialLeadership: jest.fn<ConsensusServiceContract['claimInitialLeadership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);
  service.advanceLastAppliedSequence.mockResolvedValue(consensusState);

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createByteStorageServiceMock = (): jest.Mocked<ByteStorageServiceContract> => ({
  store: jest.fn<ByteStorageServiceContract['store']>(),
  retrieve: jest.fn<ByteStorageServiceContract['retrieve']>(),
  delete: jest.fn<ByteStorageServiceContract['delete']>()
});

const createResultWaiterMock = (): jest.Mocked<TaskResultWaiterContract> => {
  return {
    wait: jest.fn<TaskResultWaiterContract['wait']>(),
    deliver: jest.fn<TaskResultWaiterContract['deliver']>(),
    fail: jest.fn<TaskResultWaiterContract['fail']>()
  } as unknown as jest.Mocked<TaskResultWaiterContract>;
};

/* tests */

describe('TaskApplyHandler', () => {
  let repository: jest.Mocked<TaskRepositoryContract>;
  let registry: jest.Mocked<TaskHandlerRegistryContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let byteStorageService: jest.Mocked<ByteStorageServiceContract>;
  let resultWaiter: jest.Mocked<TaskResultWaiterContract>;
  let taskHandler: jest.Mock<TaskDefinitionHandler<TaskDefinition>>;
  let applyHandler: TaskApplyHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createRepositoryMock();
    taskHandler = jest.fn<TaskDefinitionHandler<TaskDefinition>>().mockResolvedValue('result');
    registry = {
      register: jest.fn<TaskHandlerRegistryContract['register']>(),
      resolve: jest.fn<TaskHandlerRegistryContract['resolve']>(),
      resolveByType: jest.fn<TaskHandlerRegistryContract['resolveByType']>().mockReturnValue({
        definition,
        handler: taskHandler
      })
    } as unknown as jest.Mocked<TaskHandlerRegistryContract>;
    consensusService = createConsensusServiceMock();
    byteStorageService = createByteStorageServiceMock();
    resultWaiter = createResultWaiterMock();
    applyHandler = new TaskApplyHandler(
      repository,
      registry,
      consensusService,
      byteStorageService,
      resultWaiter,
      selfMasterNodeId,
      config
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('loads the committed sequence range using the configured batch size', async () => {
    await applyHandler.run();

    expect(repository.listTasksInSequenceRange).toHaveBeenCalledWith({
      afterSequence: consensusState.lastAppliedSequence,
      upToSequence: consensusState.lastCommittedSequence,
      limit: config.applyBatchSize
    });
  });

  test('advances past an already terminal task without resolving a handler', async () => {
    const completedTask = { ...task, state: 'completed' as const };

    repository.listTasksInSequenceRange.mockResolvedValue([completedTask]);

    await applyHandler.run();

    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(completedTask.sequence);
    expect(registry.resolveByType).not.toHaveBeenCalled();
  });

  test('fails a pending task when no handler is registered and advances its sequence', async () => {
    const registrationError = new GenericNotFoundError('No handler');

    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    registry.resolveByType.mockImplementation(() => {
      throw registrationError;
    });

    await applyHandler.run();

    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'failed',
      at: now
    });
    expect(resultWaiter.fail).toHaveBeenCalledWith(task.id, registrationError);
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });

  test('creates a missing execution and completes a task through its registered handler', async () => {
    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId.mockResolvedValueOnce([]).mockResolvedValueOnce([completedExecution]);

    await applyHandler.run();

    expect(repository.createExecutions).toHaveBeenCalledWith([
      {
        id: expect.any(String),
        taskId: task.id,
        targetMasterId: selfMasterNodeId,
        createdAt: now,
        updatedAt: now
      }
    ]);
    expect(taskHandler).toHaveBeenCalledWith({ ...task, data: { value: 'test' } });
    expect(repository.markExecutionExecuting).toHaveBeenCalledWith({
      id: pendingExecution.id,
      revision: pendingExecution.revision,
      at: now
    });
    expect(repository.markExecutionCompleted).toHaveBeenCalledWith({
      id: executingExecution.id,
      revision: executingExecution.revision,
      at: now
    });
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'completed',
      at: now
    });
    expect(resultWaiter.deliver).toHaveBeenCalledWith(task.id, 'result');
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });

  test('records handler failures and delivers the original failure', async () => {
    const handlerError = new Error('handler failed');

    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId
      .mockResolvedValueOnce([pendingExecution])
      .mockResolvedValueOnce([failedExecution]);
    taskHandler.mockRejectedValue(handlerError);

    await applyHandler.run();

    expect(repository.markExecutionFailed).toHaveBeenCalledWith({
      id: executingExecution.id,
      revision: executingExecution.revision,
      failureReason: handlerError.message,
      at: now
    });
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'failed',
      at: now
    });
    expect(resultWaiter.fail).toHaveBeenCalledWith(task.id, handlerError);
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });

  test('stops the apply sweep when claiming an execution loses its revision race', async () => {
    const secondTask = { ...task, id: '00000000-0000-4000-8000-000000000003', sequence: 7n };

    repository.listTasksInSequenceRange.mockResolvedValue([task, secondTask]);
    repository.listExecutionsByTaskId.mockResolvedValue([pendingExecution]);
    repository.markExecutionExecuting.mockRejectedValue(new GenericAbortedError());

    await applyHandler.run();

    expect(registry.resolveByType).toHaveBeenCalledTimes(1);
    expect(repository.updateTaskState).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAppliedSequence).not.toHaveBeenCalled();
  });

  test('hydrates stored payload data before invoking a dehydrated task handler', async () => {
    const bytes = Buffer.from('payload');
    const payloadTask: PersistedTask = {
      ...task,
      type: dehydratedDefinition.type,
      data: { name: 'test' },
      payloadId: '00000000-0000-4000-8000-000000000004'
    };

    repository.listTasksInSequenceRange.mockResolvedValue([payloadTask]);
    repository.listExecutionsByTaskId
      .mockResolvedValueOnce([pendingExecution])
      .mockResolvedValueOnce([completedExecution]);
    registry.resolveByType.mockReturnValue({ definition: dehydratedDefinition, handler: taskHandler });
    byteStorageService.retrieve.mockResolvedValue(bytes);

    await applyHandler.run();

    expect(byteStorageService.retrieve).toHaveBeenCalledWith(payloadTask.payloadId!);
    expect(taskHandler).toHaveBeenCalledWith({ ...payloadTask, data: { name: 'test', bytes } });
  });

  test('fails a dehydrated task that has no payload reference without running its execution', async () => {
    const payloadTask: PersistedTask = {
      ...task,
      type: dehydratedDefinition.type,
      data: { name: 'test' },
      payloadId: null
    };

    repository.listTasksInSequenceRange.mockResolvedValue([payloadTask]);
    repository.listExecutionsByTaskId.mockResolvedValue([pendingExecution]);
    registry.resolveByType.mockReturnValue({ definition: dehydratedDefinition, handler: taskHandler });

    await applyHandler.run();

    expect(taskHandler).not.toHaveBeenCalled();
    expect(repository.markExecutionExecuting).not.toHaveBeenCalled();
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: payloadTask.id,
      revision: payloadTask.revision,
      state: 'failed',
      at: now
    });
    expect(resultWaiter.fail).toHaveBeenCalledWith(payloadTask.id, expect.any(GenericInternalServerError));
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(payloadTask.sequence);
  });

  test('waits for unfinished executions instead of advancing the applied sequence', async () => {
    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId
      .mockResolvedValueOnce([pendingExecution])
      .mockResolvedValueOnce([executingExecution]);

    await applyHandler.run();

    expect(repository.updateTaskState).not.toHaveBeenCalled();
    expect(resultWaiter.deliver).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAppliedSequence).not.toHaveBeenCalled();
  });

  test('skips already finalized executions when reapplying a task', async () => {
    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId
      .mockResolvedValueOnce([completedExecution, pendingExecution])
      .mockResolvedValueOnce([completedExecution, anotherCompletedExecution]);

    await applyHandler.run();

    expect(repository.markExecutionExecuting).toHaveBeenCalledTimes(1);
    expect(repository.markExecutionExecuting).toHaveBeenCalledWith({
      id: pendingExecution.id,
      revision: pendingExecution.revision,
      at: now
    });
    expect(taskHandler).toHaveBeenCalledTimes(1);
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'completed',
      at: now
    });
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });

  test('delivers a failure when executions partially complete', async () => {
    const handlerError = new Error('handler failed');

    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId
      .mockResolvedValueOnce([pendingExecution, anotherPendingExecution])
      .mockResolvedValueOnce([completedExecution, failedExecution]);
    taskHandler.mockResolvedValueOnce('result').mockRejectedValueOnce(handlerError);

    await applyHandler.run();

    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'partially_completed',
      at: now
    });
    expect(resultWaiter.deliver).not.toHaveBeenCalled();
    expect(resultWaiter.fail).toHaveBeenCalledWith(task.id, handlerError);
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });

  test('does not hydrate a dehydrated task when every execution is already finalized', async () => {
    const payloadTask: PersistedTask = {
      ...task,
      type: dehydratedDefinition.type,
      data: { name: 'test' },
      payloadId: '00000000-0000-4000-8000-000000000004'
    };

    repository.listTasksInSequenceRange.mockResolvedValue([payloadTask]);
    repository.listExecutionsByTaskId.mockResolvedValue([completedExecution]);
    registry.resolveByType.mockReturnValue({ definition: dehydratedDefinition, handler: taskHandler });

    await applyHandler.run();

    expect(byteStorageService.retrieve).not.toHaveBeenCalled();
    expect(taskHandler).not.toHaveBeenCalled();
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: payloadTask.id,
      revision: payloadTask.revision,
      state: 'completed',
      at: now
    });
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(payloadTask.sequence);
  });

  test('delivers an empty result when a completed task is finalized without fresh outcomes', async () => {
    // documents the accepted result-loss window: after a crash mid-apply,
    // a completed re-apply has no in-memory outcome left to deliver
    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    repository.listExecutionsByTaskId.mockResolvedValue([completedExecution]);

    await applyHandler.run();

    expect(resultWaiter.deliver).toHaveBeenCalledWith(task.id, undefined);
    expect(resultWaiter.fail).not.toHaveBeenCalled();
  });

  test('fails a task whose persisted data does not decode without creating executions', async () => {
    repository.listTasksInSequenceRange.mockResolvedValue([{ ...task, data: { value: 123 } }]);

    await applyHandler.run();

    expect(repository.createExecutions).not.toHaveBeenCalled();
    expect(taskHandler).not.toHaveBeenCalled();
    expect(repository.updateTaskState).toHaveBeenCalledWith({
      id: task.id,
      revision: task.revision,
      state: 'failed',
      at: now
    });
    expect(resultWaiter.fail).toHaveBeenCalledWith(task.id, expect.any(z.ZodError));
    expect(consensusService.advanceLastAppliedSequence).toHaveBeenCalledWith(task.sequence);
  });
});
