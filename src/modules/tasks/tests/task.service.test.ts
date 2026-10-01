import { Buffer } from 'node:buffer';

import type { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import type { TaskApplyHandlerContract } from '../task.apply-handler';
import type { TaskConfig } from '../task.config';
import { createDehydratedTaskDefinition, createTaskDefinition } from '../task.definition';
import type { PersistedTask, TaskExecution } from '../task.domain';
import type { TaskForwarderContract } from '../task.forwarder';
import type { TaskHandlerRegistryContract } from '../task.handler-registry';
import type { TaskRepositoryContract } from '../task.repository';
import type { TaskResultWaiterContract } from '../task.result-waiter';
import { TaskService } from '../task.service';

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

const execution: TaskExecution = {
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

const consensusState: ConsensusState = {
  id: 'self',
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,
  lastAllocatedSequence: 5n,
  lastMatchedSequence: 5n,
  lastCommittedSequence: 5n,
  lastAppliedSequence: 5n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const leadershipContext = {
  epoch: consensusState.currentEpoch,
  leaderMasterId: selfMasterNodeId
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
  hydrateData: (data, payload) => ({ ...data, bytes: payload })
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
    clearPayloadId: jest.fn<TaskRepositoryContract['clearPayloadId']>(),
    truncateFromSequence: jest.fn<TaskRepositoryContract['truncateFromSequence']>()
  };

  repository.findById.mockResolvedValue(null);
  repository.findBySequence.mockResolvedValue(null);
  repository.listTasksFromSequence.mockResolvedValue([]);
  repository.create.mockResolvedValue(task);
  repository.createExecutions.mockResolvedValue([execution]);

  return repository;
};

const createRegistryMock = (): jest.Mocked<TaskHandlerRegistryContract> => {
  return {
    register: jest.fn<TaskHandlerRegistryContract['register']>(),
    resolve: jest.fn<TaskHandlerRegistryContract['resolve']>().mockReturnValue(jest.fn(async () => 'result')),
    resolveByType: jest.fn<TaskHandlerRegistryContract['resolveByType']>()
  } as unknown as jest.Mocked<TaskHandlerRegistryContract>;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  const transaction = {} as Prisma.TransactionClient;
  const service = {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusServiceContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusServiceContract['advanceLastAppliedSequence']>(),
    advanceLastAllocatedSequence: jest.fn<ConsensusServiceContract['advanceLastAllocatedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    withRewoundLastAllocatedSequence: jest.fn<ConsensusServiceContract['withRewoundLastAllocatedSequence']>(),
    claimInitialLeadership: jest.fn<ConsensusServiceContract['claimInitialLeadership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);
  service.advanceLastCommittedSequence.mockResolvedValue(consensusState);
  service.advanceLastAllocatedSequence.mockResolvedValue(consensusState);
  service.withAdvancedLastAllocatedSequence.mockImplementation(async (_leadershipContext, action) => {
    return action(transaction, task.sequence);
  });
  service.withRewoundLastAllocatedSequence.mockImplementation(async (_leadershipContext, sequence, action) => {
    return action(transaction, sequence);
  });

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createByteStorageServiceMock = (): jest.Mocked<ByteStorageServiceContract> => ({
  store: jest.fn<ByteStorageServiceContract['store']>(),
  retrieve: jest.fn<ByteStorageServiceContract['retrieve']>(),
  delete: jest.fn<ByteStorageServiceContract['delete']>()
});

const createTaskForwarderMock = (): jest.Mocked<TaskForwarderContract> =>
  ({
    forwardTask: jest.fn<TaskForwarderContract['forwardTask']>().mockResolvedValue('forwarded-result')
  }) as unknown as jest.Mocked<TaskForwarderContract>;

const createApplyHandlerMock = (): jest.Mocked<TaskApplyHandlerContract> => ({
  run: jest.fn<TaskApplyHandlerContract['run']>().mockResolvedValue()
});

const createResultWaiterMock = (): jest.Mocked<TaskResultWaiterContract> => {
  return {
    wait: jest.fn<TaskResultWaiterContract['wait']>().mockResolvedValue('result'),
    deliver: jest.fn<TaskResultWaiterContract['deliver']>(),
    fail: jest.fn<TaskResultWaiterContract['fail']>()
  } as unknown as jest.Mocked<TaskResultWaiterContract>;
};

/* tests */

describe('TaskService', () => {
  let repository: jest.Mocked<TaskRepositoryContract>;
  let registry: jest.Mocked<TaskHandlerRegistryContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let byteStorageService: jest.Mocked<ByteStorageServiceContract>;
  let taskForwarder: jest.Mocked<TaskForwarderContract>;
  let applyHandler: jest.Mocked<TaskApplyHandlerContract>;
  let resultWaiter: jest.Mocked<TaskResultWaiterContract>;
  let service: TaskService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    repository = createRepositoryMock();
    registry = createRegistryMock();
    consensusService = createConsensusServiceMock();
    byteStorageService = createByteStorageServiceMock();
    taskForwarder = createTaskForwarderMock();
    applyHandler = createApplyHandlerMock();
    resultWaiter = createResultWaiterMock();
    service = new TaskService(
      repository,
      registry,
      consensusService,
      byteStorageService,
      taskForwarder,
      applyHandler,
      resultWaiter,
      selfMasterNodeId,
      config
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns an existing task and rejects a missing task', async () => {
    repository.findById.mockResolvedValueOnce(task).mockResolvedValueOnce(null);

    await expect(service.getTaskById(task.id)).resolves.toBe(task);
    await expect(service.getTaskById(task.id)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  test('lists task ranges and retrieves task payloads through the task boundary', async () => {
    const payload = Buffer.from('payload');

    repository.listTasksInSequenceRange.mockResolvedValue([task]);
    byteStorageService.retrieve.mockResolvedValue(payload);

    await expect(service.listTasksInSequenceRange({ afterSequence: 1n, upToSequence: 6n, limit: 10 })).resolves.toEqual(
      [task]
    );
    await expect(service.retrieveTaskPayload(execution.id)).resolves.toEqual(payload);

    expect(repository.listTasksInSequenceRange).toHaveBeenCalledWith({
      afterSequence: 1n,
      upToSequence: 6n,
      limit: 10
    });
    expect(byteStorageService.retrieve).toHaveBeenCalledWith(execution.id);
  });

  test('finds a task by its replicated sequence', async () => {
    repository.findBySequence.mockResolvedValue(task);

    await expect(service.findTaskBySequence(task.sequence)).resolves.toBe(task);
    expect(repository.findBySequence).toHaveBeenCalledWith(task.sequence);
  });

  test('rejects task replication before writing when the cluster has no leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: null,
      votedForMasterId: null,
      lastLeaderContactAt: null
    });

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: task.payloadId,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(repository.findBySequence).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('rejects task replication when the supplied leadership context is stale', async () => {
    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: task.payloadId,
          createdAt: task.createdAt
        },
        {
          ...leadershipContext,
          epoch: leadershipContext.epoch - 1n
        }
      )
    ).rejects.toBeInstanceOf(GenericAbortedError);

    expect(repository.findBySequence).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('persists replicated tasks and their payloads through the task module', async () => {
    const payload = Buffer.from('payload');

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: execution.id,
          payload,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).resolves.toBe(task);

    expect(repository.create).toHaveBeenCalledWith(
      {
        id: task.id,
        originMasterNodeId: task.originMasterNodeId,
        epoch: task.epoch,
        sequence: task.sequence,
        type: task.type,
        executionScope: task.executionScope,
        data: task.data,
        payloadId: execution.id,
        createdAt: task.createdAt,
        updatedAt: task.createdAt
      },
      expect.anything()
    );
    expect(byteStorageService.store).toHaveBeenCalledWith(execution.id, payload);
    expect(byteStorageService.store.mock.invocationCallOrder[0]).toBeLessThan(
      repository.create.mock.invocationCallOrder[0]
    );
    expect(consensusService.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      expect.any(Function)
    );
  });

  test('persists next-sequence history from an older consensus epoch', async () => {
    const historicalTask = {
      ...task,
      epoch: consensusState.currentEpoch - 1n
    };

    repository.create.mockResolvedValue(historicalTask);

    await expect(
      service.replicateTask(
        {
          id: historicalTask.id,
          originMasterNodeId: historicalTask.originMasterNodeId,
          epoch: historicalTask.epoch,
          sequence: historicalTask.sequence,
          type: historicalTask.type,
          executionScope: historicalTask.executionScope,
          data: historicalTask.data,
          payloadId: historicalTask.payloadId,
          createdAt: historicalTask.createdAt
        },
        leadershipContext
      )
    ).resolves.toBe(historicalTask);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        epoch: historicalTask.epoch,
        sequence: historicalTask.sequence
      }),
      expect.anything()
    );
    expect(consensusService.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      expect.any(Function)
    );
  });

  test('rejects replicated payload references without bytes before advancing the sequence', async () => {
    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: execution.id,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBeInstanceOf(GenericInternalServerError);

    expect(repository.create).not.toHaveBeenCalled();
    expect(byteStorageService.store).not.toHaveBeenCalled();
    expect(consensusService.withAdvancedLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('leaves the sequence untouched when replicated task creation fails', async () => {
    const creationError = new GenericAbortedError('Task creation failed');

    repository.create.mockRejectedValue(creationError);

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: execution.id,
          payload: Buffer.from('payload'),
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBe(creationError);

    expect(byteStorageService.store).toHaveBeenCalledWith(execution.id, Buffer.from('payload'));
    expect(consensusService.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      expect.any(Function)
    );
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('reconciles replicated task replays without creating another task row', async () => {
    const payload = Buffer.from('payload');
    const taskWithPayload = { ...task, payloadId: execution.id };

    repository.findBySequence.mockResolvedValue(taskWithPayload);

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: execution.id,
          payload,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).resolves.toBe(taskWithPayload);

    expect(byteStorageService.store).toHaveBeenCalledWith(execution.id, payload);
    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).toHaveBeenCalledWith(task.sequence, leadershipContext);
  });

  test('accepts an exact replay of an already allocated task without advancing the sequence again', async () => {
    repository.findBySequence.mockResolvedValue(task);
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: task.sequence
    });

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: task.payloadId,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).resolves.toBe(task);

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('recovers a next-sequence replay from an older consensus epoch', async () => {
    const historicalTask = {
      ...task,
      epoch: consensusState.currentEpoch - 1n
    };

    repository.findBySequence.mockResolvedValue(historicalTask);

    await expect(
      service.replicateTask(
        {
          id: historicalTask.id,
          originMasterNodeId: historicalTask.originMasterNodeId,
          epoch: historicalTask.epoch,
          sequence: historicalTask.sequence,
          type: historicalTask.type,
          executionScope: historicalTask.executionScope,
          data: historicalTask.data,
          payloadId: historicalTask.payloadId,
          createdAt: historicalTask.createdAt
        },
        leadershipContext
      )
    ).resolves.toBe(historicalTask);

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).toHaveBeenCalledWith(
      historicalTask.sequence,
      leadershipContext
    );
  });

  test('rejects a replay whose immutable task data differs', async () => {
    repository.findBySequence.mockResolvedValue(task);

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: { value: 'different' },
          payloadId: task.payloadId,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('does not advance a replayed task when its payload cannot be restored', async () => {
    const storageError = new Error('Payload storage failed');
    const taskWithPayload = { ...task, payloadId: execution.id };

    repository.findBySequence.mockResolvedValue(taskWithPayload);
    byteStorageService.store.mockRejectedValue(storageError);

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: execution.id,
          payload: Buffer.from('payload'),
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBe(storageError);

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('rejects a different task at an already occupied sequence', async () => {
    const divergentTask = {
      ...task,
      id: '00000000-0000-4000-8000-000000000003',
      payloadId: execution.id
    };

    repository.findBySequence.mockResolvedValue(divergentTask);

    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: null,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(repository.truncateFromSequence).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test.each([task.sequence - 1n, task.sequence + 1n])(
    'rejects a new replicated task at non-next sequence %s',
    async (sequence) => {
      await expect(
        service.replicateTask(
          {
            id: task.id,
            originMasterNodeId: task.originMasterNodeId,
            epoch: task.epoch,
            sequence,
            type: task.type,
            executionScope: task.executionScope,
            data: task.data,
            payloadId: null,
            createdAt: task.createdAt
          },
          leadershipContext
        )
      ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

      expect(repository.create).not.toHaveBeenCalled();
      expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
    }
  );

  test('rejects a next-sequence task from a future consensus epoch', async () => {
    await expect(
      service.replicateTask(
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch + 1n,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: null,
          createdAt: task.createdAt
        },
        leadershipContext
      )
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('deletes only uncommitted task tails and their payloads', async () => {
    const taskWithPayload = { ...task, payloadId: execution.id };
    const inlineTask = {
      ...task,
      id: '00000000-0000-4000-8000-000000000003',
      sequence: task.sequence + 1n
    };

    repository.listTasksFromSequence.mockResolvedValue([taskWithPayload, inlineTask]);
    repository.truncateFromSequence.mockResolvedValue(2);
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: inlineTask.sequence
    });

    await expect(service.deleteTasksFromSequence(task.sequence, leadershipContext)).resolves.toBe(2);

    expect(consensusService.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      task.sequence - 1n,
      expect.any(Function)
    );
    expect(repository.listTasksFromSequence).toHaveBeenCalledWith(task.sequence, expect.any(Object));
    expect(repository.truncateFromSequence).toHaveBeenCalledWith(task.sequence, expect.any(Object));
    expect(byteStorageService.delete).toHaveBeenCalledWith(execution.id);
    expect(byteStorageService.delete).toHaveBeenCalledTimes(1);
    expect(repository.truncateFromSequence.mock.invocationCallOrder[0]).toBeLessThan(
      byteStorageService.delete.mock.invocationCallOrder[0]
    );
  });

  test('rejects task-tail deletion when the supplied leadership context is stale', async () => {
    await expect(
      service.deleteTasksFromSequence(task.sequence, {
        ...leadershipContext,
        leaderMasterId: 'master-node-b'
      })
    ).rejects.toBeInstanceOf(GenericAbortedError);

    expect(consensusService.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
    expect(repository.listTasksFromSequence).not.toHaveBeenCalled();
    expect(repository.truncateFromSequence).not.toHaveBeenCalled();
  });

  test('preserves a completed sequence rewind when payload cleanup fails', async () => {
    const cleanupError = new Error('Payload cleanup failed');

    repository.listTasksFromSequence.mockResolvedValue([{ ...task, payloadId: execution.id }]);
    repository.truncateFromSequence.mockResolvedValue(1);
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: task.sequence
    });
    byteStorageService.delete.mockRejectedValue(cleanupError);

    await expect(service.deleteTasksFromSequence(task.sequence, leadershipContext)).rejects.toBe(cleanupError);

    expect(repository.truncateFromSequence).toHaveBeenCalledWith(task.sequence, expect.any(Object));
  });

  test('deletes a crash-window row immediately beyond the allocated sequence without lowering the counter', async () => {
    repository.listTasksFromSequence.mockResolvedValue([task]);
    repository.truncateFromSequence.mockResolvedValue(1);

    await expect(service.deleteTasksFromSequence(task.sequence, leadershipContext)).resolves.toBe(1);

    expect(consensusService.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      consensusState.lastAllocatedSequence,
      expect.any(Function)
    );
    expect(repository.truncateFromSequence).toHaveBeenCalledWith(task.sequence, expect.any(Object));
  });

  test('returns without rewinding when the requested tail starts beyond the allocated sequence', async () => {
    await expect(service.deleteTasksFromSequence(task.sequence + 1n, leadershipContext)).resolves.toBe(0);

    expect(consensusService.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
    expect(repository.listTasksFromSequence).not.toHaveBeenCalled();
    expect(repository.truncateFromSequence).not.toHaveBeenCalled();
  });

  test('rejects deletion of committed task history', async () => {
    await expect(
      service.deleteTasksFromSequence(consensusState.lastCommittedSequence, leadershipContext)
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(repository.listTasksFromSequence).not.toHaveBeenCalled();
    expect(repository.truncateFromSequence).not.toHaveBeenCalled();
  });

  test('registers task handlers through the registry', () => {
    const handler = jest.fn(async () => 'result');

    service.registerHandler(definition, handler);

    expect(registry.register).toHaveBeenCalledWith(definition, handler);
  });

  test('submits an inline task under the next allocated sequence without committing it', async () => {
    await expect(service.submitTask(definition, { value: 'test' })).resolves.toBe(task);

    expect(consensusService.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      leadershipContext,
      expect.any(Function)
    );
    expect(repository.create).toHaveBeenCalledWith(
      {
        id: expect.any(String),
        originMasterNodeId: selfMasterNodeId,
        epoch: consensusState.currentEpoch,
        sequence: task.sequence,
        type: definition.type,
        executionScope: definition.executionScope,
        data: { value: 'test' },
        payloadId: null,
        createdAt: now,
        updatedAt: now
      },
      expect.any(Object)
    );
    expect(byteStorageService.store).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('rejects task submission when this master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({ ...consensusState, leaderMasterId: 'other-master' });

    await expect(service.submitTask(definition, { value: 'test' })).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );

    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('stores dehydrated task payloads after creating their task rows', async () => {
    const bytes = Buffer.from('payload');

    await service.submitTask(dehydratedDefinition, { name: 'test', bytes });

    const createInput = repository.create.mock.calls[0][0];

    expect(createInput).toMatchObject({
      type: dehydratedDefinition.type,
      data: { name: 'test' },
      payloadId: expect.any(String)
    });
    expect(byteStorageService.store).toHaveBeenCalledWith(createInput.payloadId!, bytes);
  });

  test('does not commit a dehydrated task when payload storage fails', async () => {
    const storageError = new Error('storage failed');

    byteStorageService.store.mockRejectedValue(storageError);

    await expect(
      service.submitTask(dehydratedDefinition, { name: 'test', bytes: Buffer.from('payload') })
    ).rejects.toBe(storageError);
    expect(repository.create).toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('executes a registered task against targets resolved from its scope', async () => {
    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).resolves.toBe('result');

    const createInput = repository.create.mock.calls[0][0];

    expect(registry.resolve).toHaveBeenCalledWith(definition);
    expect(repository.createExecutions).toHaveBeenCalledWith(
      [
        {
          id: expect.any(String),
          taskId: task.id,
          targetMasterId: selfMasterNodeId,
          createdAt: now,
          updatedAt: now
        }
      ],
      expect.any(Object)
    );
    expect(resultWaiter.wait).toHaveBeenCalledWith(createInput.id, config.executionWaitTimeoutMs);
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(applyHandler.run).toHaveBeenCalled();
  });

  test('forwards execution to the cluster leader when this master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({ ...consensusState, leaderMasterId: 'other-master' });

    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).resolves.toBe('forwarded-result');

    expect(taskForwarder.forwardTask).toHaveBeenCalledWith(definition, { value: 'test' }, 'other-master');
    expect(repository.create).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(applyHandler.run).not.toHaveBeenCalled();
  });

  test('rejects execution when the cluster has no leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({ ...consensusState, leaderMasterId: null });

    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );

    expect(taskForwarder.forwardTask).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects explicit execution without target master nodes', async () => {
    await expect(service.executeTaskByDefinitionAndTargets(definition, { value: 'test' }, [])).rejects.toBeInstanceOf(
      GenericAbortedError
    );

    expect(registry.resolve).not.toHaveBeenCalled();
    expect(resultWaiter.wait).not.toHaveBeenCalled();
  });

  test('ignores immediate apply failures while waiting for durable recovery', async () => {
    applyHandler.run.mockRejectedValue(new Error('apply sweep failed'));

    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).resolves.toBe('result');
  });

  test('propagates execution failures delivered through the result waiter', async () => {
    const executionError = new Error('execution failed');

    resultWaiter.wait.mockRejectedValue(executionError);

    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).rejects.toBe(executionError);

    expect(repository.create).toHaveBeenCalled();
    expect(repository.createExecutions).toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(applyHandler.run).toHaveBeenCalled();
  });

  test('fails the result waiter when execution submission fails', async () => {
    const submissionError = new Error('submission failed');
    let rejectResult!: (error: unknown) => void;
    const resultPromise = new Promise<unknown>((_resolve, reject) => {
      rejectResult = reject;
    });

    resultWaiter.wait.mockReturnValue(resultPromise);
    resultWaiter.fail.mockImplementation((_id, error) => rejectResult(error));
    repository.create.mockRejectedValue(submissionError);

    await expect(service.executeTaskByDefinition(definition, { value: 'test' })).rejects.toBe(submissionError);

    expect(resultWaiter.fail).toHaveBeenCalledWith(expect.any(String), submissionError);
    expect(applyHandler.run).toHaveBeenCalled();
  });
});
