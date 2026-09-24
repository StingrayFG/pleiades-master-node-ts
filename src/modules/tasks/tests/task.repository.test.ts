import {
  Prisma,
  type Task as PrismaTask,
  type TaskExecution as PrismaTaskExecution,
  type PrismaClient
} from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAbortedError, GenericMapperError } from '@/errors/application.errors';

import type { CreateTaskExecutionRepositoryInput, CreateTaskRepositoryInput } from '../task.application';
import type { PersistedTask, TaskExecution } from '../task.domain';
import { TaskRepository } from '../task.repository';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const taskId = '00000000-0000-4000-8000-000000000001';
const executionId = '00000000-0000-4000-8000-000000000002';
const selfMasterNodeId = 'master-node-test';

const prismaTask: PrismaTask = {
  id: taskId,
  origin_master_id: selfMasterNodeId,
  epoch: 1n,
  sequence: 2n,
  type: 'test.execute',
  data: { value: 'test' },
  execution_scope: 'local',
  payload_id: null,
  state: 'pending',
  created_at: now,
  updated_at: now,
  revision: 0n
};

const task: PersistedTask = {
  id: prismaTask.id,
  originMasterNodeId: prismaTask.origin_master_id,
  epoch: prismaTask.epoch,
  sequence: prismaTask.sequence,
  type: prismaTask.type,
  data: prismaTask.data,
  executionScope: prismaTask.execution_scope,
  payloadId: prismaTask.payload_id,
  state: prismaTask.state,
  createdAt: prismaTask.created_at,
  updatedAt: prismaTask.updated_at,
  revision: prismaTask.revision
};

const prismaExecution: PrismaTaskExecution = {
  id: executionId,
  task_id: taskId,
  target_master_id: selfMasterNodeId,
  state: 'pending',
  failure_reason: null,
  created_at: now,
  started_at: null,
  completed_at: null,
  updated_at: now,
  revision: 0n
};

const execution: TaskExecution = {
  id: prismaExecution.id,
  taskId: prismaExecution.task_id,
  targetMasterId: prismaExecution.target_master_id,
  state: prismaExecution.state,
  failureReason: prismaExecution.failure_reason,
  createdAt: prismaExecution.created_at,
  startedAt: prismaExecution.started_at,
  completedAt: prismaExecution.completed_at,
  updatedAt: prismaExecution.updated_at,
  revision: prismaExecution.revision
};

const createTaskInput: CreateTaskRepositoryInput<'test.execute', 'local'> = {
  id: task.id,
  originMasterNodeId: task.originMasterNodeId,
  epoch: task.epoch,
  sequence: task.sequence,
  type: 'test.execute',
  data: { value: 'test' },
  executionScope: 'local',
  payloadId: null,
  createdAt: now,
  updatedAt: now
};

const createExecutionInput: CreateTaskExecutionRepositoryInput = {
  id: execution.id,
  taskId: execution.taskId,
  targetMasterId: execution.targetMasterId,
  createdAt: now,
  updatedAt: now
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });
};

/* mocks */

type TaskDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaTask[]>>;
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaTask | null>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaTask>>;
  deleteMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  update: jest.Mock<(...args: unknown[]) => Promise<PrismaTask>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

type TaskExecutionDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaTaskExecution[]>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaTaskExecution>>;
  update: jest.Mock<(...args: unknown[]) => Promise<PrismaTaskExecution>>;
};

describe('TaskRepository', () => {
  let taskDelegate: TaskDelegateMock;
  let executionDelegate: TaskExecutionDelegateMock;
  let transaction: jest.Mock<(...args: unknown[]) => Promise<unknown[]>>;
  let repository: TaskRepository;

  beforeEach(() => {
    taskDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaTask[]>>().mockResolvedValue([]),
      findUnique: jest.fn<(...args: unknown[]) => Promise<PrismaTask | null>>().mockResolvedValue(null),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaTask>>().mockResolvedValue(prismaTask),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      update: jest.fn<(...args: unknown[]) => Promise<PrismaTask>>().mockResolvedValue(prismaTask),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    executionDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaTaskExecution[]>>().mockResolvedValue([]),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaTaskExecution>>().mockResolvedValue(prismaExecution),
      update: jest.fn<(...args: unknown[]) => Promise<PrismaTaskExecution>>().mockResolvedValue(prismaExecution)
    };
    transaction = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockImplementation(async (operations) => {
      return Promise.all(operations as Promise<unknown>[]);
    });

    repository = new TaskRepository({
      task: taskDelegate,
      taskExecution: executionDelegate,
      $transaction: transaction
    } as unknown as PrismaClient);
  });

  test('lists tasks in committed sequence order and maps the rows', async () => {
    taskDelegate.findMany.mockResolvedValue([prismaTask]);

    await expect(
      repository.listTasksInSequenceRange({ afterSequence: 0n, upToSequence: 5n, limit: 10 })
    ).resolves.toEqual([task]);
    expect(taskDelegate.findMany).toHaveBeenCalledWith({
      where: { sequence: { gt: 0n, lte: 5n } },
      orderBy: { sequence: 'asc' },
      take: 10
    });
  });

  test('lists the task tail from a sequence in ascending order', async () => {
    taskDelegate.findMany.mockResolvedValue([prismaTask]);

    await expect(repository.listTasksFromSequence(task.sequence)).resolves.toEqual([task]);
    expect(taskDelegate.findMany).toHaveBeenCalledWith({
      where: { sequence: { gte: task.sequence } },
      orderBy: { sequence: 'asc' }
    });
  });

  test('lists the task tail through an existing transaction when supplied', async () => {
    const transactionFindMany = jest
      .fn<(...args: unknown[]) => Promise<PrismaTask[]>>()
      .mockResolvedValue([prismaTask]);
    const tx = { task: { findMany: transactionFindMany } } as unknown as Prisma.TransactionClient;

    await expect(repository.listTasksFromSequence(task.sequence, tx)).resolves.toEqual([task]);
    expect(transactionFindMany).toHaveBeenCalledWith({
      where: { sequence: { gte: task.sequence } },
      orderBy: { sequence: 'asc' }
    });
    expect(taskDelegate.findMany).not.toHaveBeenCalled();
  });

  test('propagates task tail query failures', async () => {
    const queryError = new Error('Task query failed');

    taskDelegate.findMany.mockRejectedValue(queryError);

    await expect(repository.listTasksFromSequence(task.sequence)).rejects.toBe(queryError);
  });

  test('lists terminal tasks with payloads for cleanup', async () => {
    taskDelegate.findMany.mockResolvedValue([{ ...prismaTask, state: 'completed', payload_id: executionId }]);
    const updatedBefore = new Date('2026-01-02T00:00:00.000Z');

    await repository.listPayloadCleanupCandidates({ updatedBefore, limit: 4 });

    expect(taskDelegate.findMany).toHaveBeenCalledWith({
      where: {
        state: { in: ['completed', 'partially_completed', 'failed'] },
        payload_id: { not: null },
        updated_at: { lte: updatedBefore }
      },
      orderBy: { updated_at: 'asc' },
      take: 4
    });
  });

  test('lists stale pending tasks beyond the committed sequence', async () => {
    const updatedBefore = new Date('2026-01-02T00:00:00.000Z');

    await repository.listUncommittedCleanupCandidates({ afterSequence: 5n, updatedBefore, limit: 3 });

    expect(taskDelegate.findMany).toHaveBeenCalledWith({
      where: { state: 'pending', sequence: { gt: 5n }, updated_at: { lte: updatedBefore } },
      orderBy: { updated_at: 'asc' },
      take: 3
    });
  });

  test('lists task executions in creation order', async () => {
    executionDelegate.findMany.mockResolvedValue([prismaExecution]);

    await expect(repository.listExecutionsByTaskId(taskId)).resolves.toEqual([execution]);
    expect(executionDelegate.findMany).toHaveBeenCalledWith({
      where: { task_id: taskId },
      orderBy: { created_at: 'asc' }
    });
  });

  test('finds a task by id and returns null when it is missing', async () => {
    taskDelegate.findUnique.mockResolvedValueOnce(prismaTask).mockResolvedValueOnce(null);

    await expect(repository.findById(taskId)).resolves.toEqual(task);
    await expect(repository.findById(taskId)).resolves.toBeNull();
    expect(taskDelegate.findUnique).toHaveBeenCalledWith({ where: { id: taskId } });
  });

  test('finds a task by sequence', async () => {
    taskDelegate.findUnique.mockResolvedValue(prismaTask);

    await expect(repository.findBySequence(task.sequence)).resolves.toEqual(task);
    expect(taskDelegate.findUnique).toHaveBeenCalledWith({
      where: {
        sequence: task.sequence
      }
    });
  });

  test('creates a pending task with explicit ordering and timestamps', async () => {
    await expect(repository.create(createTaskInput)).resolves.toEqual(task);
    expect(taskDelegate.create).toHaveBeenCalledWith({
      data: {
        id: taskId,
        origin_master_id: task.originMasterNodeId,
        epoch: task.epoch,
        sequence: task.sequence,
        type: task.type,
        execution_scope: task.executionScope,
        data: task.data,
        payload_id: null,
        state: 'pending',
        created_at: now,
        updated_at: now
      }
    });
  });

  test('creates pending executions inside a Prisma transaction', async () => {
    await expect(repository.createExecutions([createExecutionInput])).resolves.toEqual([execution]);
    expect(executionDelegate.create).toHaveBeenCalledWith({
      data: {
        id: executionId,
        task_id: taskId,
        target_master_id: selfMasterNodeId,
        state: 'pending',
        created_at: now,
        updated_at: now
      }
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  test('routes execution creation through an existing transaction when supplied', async () => {
    const transactionCreate = jest
      .fn<(...args: unknown[]) => Promise<PrismaTaskExecution>>()
      .mockResolvedValue(prismaExecution);
    const tx = { taskExecution: { create: transactionCreate } } as unknown as Prisma.TransactionClient;

    await expect(repository.createExecutions([createExecutionInput], tx)).resolves.toEqual([execution]);

    expect(transactionCreate).toHaveBeenCalled();
    expect(executionDelegate.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  test('applies execution lifecycle transitions with optimistic revisions', async () => {
    await repository.markExecutionExecuting({ id: executionId, revision: 0n, at: now });
    await repository.markExecutionCompleted({ id: executionId, revision: 1n, at: now });
    await repository.markExecutionFailed({ id: executionId, revision: 1n, failureReason: 'failed', at: now });

    expect(executionDelegate.update).toHaveBeenNthCalledWith(1, {
      where: { id: executionId, revision: 0n },
      data: { state: 'executing', started_at: now, updated_at: now, revision: { increment: 1 } }
    });
    expect(executionDelegate.update).toHaveBeenNthCalledWith(2, {
      where: { id: executionId, revision: 1n },
      data: { state: 'completed', completed_at: now, updated_at: now, revision: { increment: 1 } }
    });
    expect(executionDelegate.update).toHaveBeenNthCalledWith(3, {
      where: { id: executionId, revision: 1n },
      data: { state: 'failed', failure_reason: 'failed', updated_at: now, revision: { increment: 1 } }
    });
  });

  test('updates task state and conditionally clears its payload reference', async () => {
    await repository.updateTaskState({ id: taskId, revision: 0n, state: 'completed', at: now });
    await expect(repository.clearPayloadId({ id: taskId, revision: 1n })).resolves.toBe(true);

    expect(taskDelegate.update).toHaveBeenCalledWith({
      where: { id: taskId, revision: 0n },
      data: { state: 'completed', updated_at: now, revision: { increment: 1 } }
    });
    expect(taskDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: taskId, revision: 1n, payload_id: { not: null } },
      data: { payload_id: null, revision: { increment: 1 } }
    });

    taskDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.clearPayloadId({ id: taskId, revision: 1n })).resolves.toBe(false);
  });

  test('truncates a task tail from the requested sequence', async () => {
    await expect(repository.truncateFromSequence(task.sequence)).resolves.toBe(1);
    expect(taskDelegate.deleteMany).toHaveBeenCalledWith({
      where: {
        sequence: {
          gte: task.sequence
        }
      }
    });
  });

  test('truncates the task tail through an existing transaction when supplied', async () => {
    const transactionDeleteMany = jest
      .fn<(...args: unknown[]) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 2 });
    const tx = { task: { deleteMany: transactionDeleteMany } } as unknown as Prisma.TransactionClient;

    await expect(repository.truncateFromSequence(task.sequence, tx)).resolves.toBe(2);
    expect(transactionDeleteMany).toHaveBeenCalledWith({
      where: {
        sequence: {
          gte: task.sequence
        }
      }
    });
    expect(taskDelegate.deleteMany).not.toHaveBeenCalled();
  });

  test('propagates task tail truncation failures', async () => {
    const deletionError = new Error('Task deletion failed');

    taskDelegate.deleteMany.mockRejectedValue(deletionError);

    await expect(repository.truncateFromSequence(task.sequence)).rejects.toBe(deletionError);
  });

  test('maps payload reference clearing concurrency failures to aborted errors', async () => {
    taskDelegate.updateMany.mockRejectedValue(createPrismaError('P2025'));

    await expect(repository.clearPayloadId({ id: taskId, revision: 1n })).rejects.toBeInstanceOf(GenericAbortedError);
  });

  test.each(['P2002', 'P2025'])('maps Prisma %s concurrency failures to aborted errors', async (code) => {
    taskDelegate.update.mockRejectedValue(createPrismaError(code));

    await expect(
      repository.updateTaskState({ id: taskId, revision: 0n, state: 'completed', at: now })
    ).rejects.toBeInstanceOf(GenericAbortedError);
  });

  test('propagates mapper errors from invalid Prisma rows', async () => {
    taskDelegate.findMany.mockResolvedValue([{ ...prismaTask, id: 'invalid' }]);

    await expect(
      repository.listTasksInSequenceRange({ afterSequence: 0n, upToSequence: 5n, limit: 10 })
    ).rejects.toBeInstanceOf(GenericMapperError);
  });
});
