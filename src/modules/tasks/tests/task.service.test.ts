import { Buffer } from 'node:buffer';

import type { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import { GenericAbortedError, GenericFailedPreconditionError, GenericNotFoundError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import type { TaskApplyHandlerContract } from '../task.apply-handler';
import type { TaskConfig } from '../task.config';
import { createDehydratedTaskDefinition, createTaskDefinition } from '../task.definition';
import type { PersistedTask, TaskExecution } from '../task.domain';
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
  lastAllocatedSequence: 5n,
  lastCommittedSequence: 5n,
  lastAppliedSequence: 5n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const definition = createTaskDefinition<{ value: string }, string, 'test.execute', 'local'>({
  type: 'test.execute',
  dataSchema: z.object({ value: z.string() }),
  executionScope: 'local'
});

const dehydratedDefinition = createDehydratedTaskDefinition<
  { name: string; bytes: Buffer },
  { name: string },
  void,
  'test.dehydrated',
  'local'
>({
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
    listPayloadCleanupCandidates: jest.fn<TaskRepositoryContract['listPayloadCleanupCandidates']>(),
    listUncommittedCleanupCandidates: jest.fn<TaskRepositoryContract['listUncommittedCleanupCandidates']>(),
    listExecutionsByTaskId: jest.fn<TaskRepositoryContract['listExecutionsByTaskId']>(),
    findById: jest.fn<TaskRepositoryContract['findById']>(),
    create: jest.fn<TaskRepositoryContract['create']>(),
    createExecutions: jest.fn<TaskRepositoryContract['createExecutions']>(),
    markExecutionExecuting: jest.fn<TaskRepositoryContract['markExecutionExecuting']>(),
    markExecutionCompleted: jest.fn<TaskRepositoryContract['markExecutionCompleted']>(),
    markExecutionFailed: jest.fn<TaskRepositoryContract['markExecutionFailed']>(),
    updateTaskState: jest.fn<TaskRepositoryContract['updateTaskState']>(),
    clearPayloadId: jest.fn<TaskRepositoryContract['clearPayloadId']>()
  };

  repository.findById.mockResolvedValue(null);
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
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    bootstrapLeadership: jest.fn<ConsensusServiceContract['bootstrapLeadership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);
  service.advanceLastCommittedSequence.mockResolvedValue(consensusState);
  service.withAdvancedLastAllocatedSequence.mockImplementation(async (_epoch, action) => {
    return action(transaction, task.sequence);
  });

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createByteStorageServiceMock = (): jest.Mocked<ByteStorageServiceContract> => ({
  store: jest.fn<ByteStorageServiceContract['store']>(),
  retrieve: jest.fn<ByteStorageServiceContract['retrieve']>(),
  delete: jest.fn<ByteStorageServiceContract['delete']>()
});

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
    applyHandler = createApplyHandlerMock();
    resultWaiter = createResultWaiterMock();
    service = new TaskService(
      repository,
      registry,
      consensusService,
      byteStorageService,
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

  test('registers task handlers through the registry', () => {
    const handler = jest.fn(async () => 'result');

    service.registerHandler(definition, handler);

    expect(registry.register).toHaveBeenCalledWith(definition, handler);
  });

  test('submits an inline task under the next allocated sequence and commits it', async () => {
    await expect(service.submitTask(definition, { value: 'test' })).resolves.toBe(task);

    expect(consensusService.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      consensusState.currentEpoch,
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
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(task.sequence);
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
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(task.sequence);
    expect(applyHandler.run).toHaveBeenCalled();
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
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(task.sequence);
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
