import { Prisma, type PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAbortedError } from '@/errors/application.errors';

import type {
  CreateTaskExecutionRepositoryInput,
  CreateTaskRepositoryInput,
  FailTaskExecutionRepositoryInput,
  ListTasksInSequenceRangeRepositoryInput,
  TransitionTaskExecutionRepositoryInput,
  UpdateTaskStateRepositoryInput
} from './task.application';
import type { PersistedTask, TaskExecution, TaskExecutionScope, TaskId } from './task.domain';
import { mapPrismaTaskExecutionToDomainTaskExecution, mapPrismaTaskToDomainTask } from './task.mappers';

/* contract */

type TaskRepositoryContract = {
  listTasksInSequenceRange(input: ListTasksInSequenceRangeRepositoryInput): Promise<PersistedTask[]>;
  listExecutionsByTaskId(taskId: TaskId): Promise<TaskExecution[]>;
  findById(id: TaskId): Promise<PersistedTask | null>;
  create<TType extends string, TScope extends TaskExecutionScope>(
    input: CreateTaskRepositoryInput<TType, TScope>,
    tx?: Prisma.TransactionClient
  ): Promise<PersistedTask>;
  createExecutions(
    inputs: CreateTaskExecutionRepositoryInput[],
    tx?: Prisma.TransactionClient
  ): Promise<TaskExecution[]>;
  markExecutionExecuting(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution>;
  markExecutionCompleted(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution>;
  markExecutionFailed(input: FailTaskExecutionRepositoryInput): Promise<TaskExecution>;
  updateTaskState(input: UpdateTaskStateRepositoryInput): Promise<PersistedTask>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {
  errors: {
    uniqueConstraintViolation: {
      createError: (message, cause) => new GenericAbortedError(message, { cause }),
      message: 'Task creation was aborted by a concurrent change'
    },
    requiredRecordNotFound: {
      createError: (message, cause) => new GenericAbortedError(message, { cause }),
      message: 'Task state transition was aborted by a concurrent change'
    }
  }
};

class TaskRepository implements TaskRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listTasksInSequenceRange(input: ListTasksInSequenceRangeRepositoryInput): Promise<PersistedTask[]> {
    let tasks;

    try {
      tasks = await this.prisma.task.findMany({
        where: {
          sequence: {
            gt: input.afterSequence,
            lte: input.upToSequence
          }
        },
        orderBy: {
          sequence: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return tasks.map(mapPrismaTaskToDomainTask);
  }

  async listExecutionsByTaskId(taskId: TaskId): Promise<TaskExecution[]> {
    let executions;

    try {
      executions = await this.prisma.taskExecution.findMany({
        where: {
          task_id: taskId
        },
        orderBy: {
          created_at: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return executions.map(mapPrismaTaskExecutionToDomainTaskExecution);
  }

  async findById(id: TaskId): Promise<PersistedTask | null> {
    let task;

    try {
      task = await this.prisma.task.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return task ? mapPrismaTaskToDomainTask(task) : null;
  }

  async create<TType extends string, TScope extends TaskExecutionScope>(
    input: CreateTaskRepositoryInput<TType, TScope>,
    tx?: Prisma.TransactionClient
  ): Promise<PersistedTask> {
    const client = tx ?? this.prisma;

    let task;

    try {
      task = await client.task.create({
        data: {
          id: input.id,

          origin_master_id: input.originMasterNodeId,
          epoch: input.epoch,
          sequence: input.sequence,

          type: input.type,
          execution_scope: input.executionScope,
          data: input.data,

          state: 'pending',

          created_at: input.createdAt,
          updated_at: input.updatedAt
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaTaskToDomainTask(task);
  }

  async createExecutions(
    inputs: CreateTaskExecutionRepositoryInput[],
    tx?: Prisma.TransactionClient
  ): Promise<TaskExecution[]> {
    let executions;

    try {
      if (tx) {
        executions = [];

        for (const input of inputs) {
          executions.push(await tx.taskExecution.create({ data: this.toExecutionCreateData(input) }));
        }
      } else {
        executions = await this.prisma.$transaction(
          inputs.map((input) => this.prisma.taskExecution.create({ data: this.toExecutionCreateData(input) }))
        );
      }
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return executions.map(mapPrismaTaskExecutionToDomainTaskExecution);
  }

  private toExecutionCreateData(input: CreateTaskExecutionRepositoryInput) {
    return {
      id: input.id,
      task_id: input.taskId,

      target_master_id: input.targetMasterId,

      state: 'pending' as const,

      created_at: input.createdAt,
      updated_at: input.updatedAt
    };
  }

  async markExecutionExecuting(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution> {
    let execution;

    try {
      execution = await this.prisma.taskExecution.update({
        where: {
          id: input.id,
          revision: input.revision
        },
        data: {
          state: 'executing',
          started_at: input.at,
          updated_at: input.at,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaTaskExecutionToDomainTaskExecution(execution);
  }

  async markExecutionCompleted(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution> {
    let execution;

    try {
      execution = await this.prisma.taskExecution.update({
        where: {
          id: input.id,
          revision: input.revision
        },
        data: {
          state: 'completed',
          completed_at: input.at,
          updated_at: input.at,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaTaskExecutionToDomainTaskExecution(execution);
  }

  async markExecutionFailed(input: FailTaskExecutionRepositoryInput): Promise<TaskExecution> {
    let execution;

    try {
      execution = await this.prisma.taskExecution.update({
        where: {
          id: input.id,
          revision: input.revision
        },
        data: {
          state: 'failed',
          failure_reason: input.failureReason,
          updated_at: input.at,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaTaskExecutionToDomainTaskExecution(execution);
  }

  async updateTaskState(input: UpdateTaskStateRepositoryInput): Promise<PersistedTask> {
    let task;

    try {
      task = await this.prisma.task.update({
        where: {
          id: input.id,
          revision: input.revision
        },
        data: {
          state: input.state,
          updated_at: input.at,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaTaskToDomainTask(task);
  }
}

/* exports */

export { TaskRepository };
export type { TaskRepositoryContract };
