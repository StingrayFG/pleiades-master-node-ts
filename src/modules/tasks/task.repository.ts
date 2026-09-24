import { Prisma, type PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAbortedError } from '@/errors/application.errors';

import type {
  ClearTaskPayloadIdRepositoryInput,
  CreateTaskExecutionRepositoryInput,
  CreateTaskRepositoryInput,
  FailTaskExecutionRepositoryInput,
  ListPayloadCleanupCandidatesRepositoryInput,
  ListTasksInSequenceRangeRepositoryInput,
  ListUncommittedCleanupCandidatesRepositoryInput,
  TransitionTaskExecutionRepositoryInput,
  UpdateTaskStateRepositoryInput
} from './task.application';
import type { PersistedTask, TaskExecution, TaskExecutionScope, TaskId, TaskSequence } from './task.domain';
import { mapPrismaTaskExecutionToDomainTaskExecution, mapPrismaTaskToDomainTask } from './task.mappers';

/* contract */

type TaskRepositoryContract = {
  // list
  listTasksInSequenceRange(input: ListTasksInSequenceRangeRepositoryInput): Promise<PersistedTask[]>;
  listTasksFromSequence(sequence: TaskSequence, tx?: Prisma.TransactionClient): Promise<PersistedTask[]>;
  listPayloadCleanupCandidates(input: ListPayloadCleanupCandidatesRepositoryInput): Promise<PersistedTask[]>;
  listUncommittedCleanupCandidates(input: ListUncommittedCleanupCandidatesRepositoryInput): Promise<PersistedTask[]>;
  listExecutionsByTaskId(taskId: TaskId): Promise<TaskExecution[]>;

  // find
  findById(id: TaskId): Promise<PersistedTask | null>;
  findBySequence(sequence: TaskSequence): Promise<PersistedTask | null>;

  // create
  create<TType extends string, TScope extends TaskExecutionScope>(
    input: CreateTaskRepositoryInput<TType, TScope>,
    tx?: Prisma.TransactionClient
  ): Promise<PersistedTask>;
  createExecutions(
    inputs: CreateTaskExecutionRepositoryInput[],
    tx?: Prisma.TransactionClient
  ): Promise<TaskExecution[]>;

  // execution
  markExecutionExecuting(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution>;
  markExecutionCompleted(input: TransitionTaskExecutionRepositoryInput): Promise<TaskExecution>;
  markExecutionFailed(input: FailTaskExecutionRepositoryInput): Promise<TaskExecution>;

  // update
  updateTaskState(input: UpdateTaskStateRepositoryInput): Promise<PersistedTask>;
  clearPayloadId(input: ClearTaskPayloadIdRepositoryInput): Promise<boolean>;

  // delete
  truncateFromSequence(sequence: TaskSequence, tx?: Prisma.TransactionClient): Promise<number>;
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

  /* list methods */

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

  async listTasksFromSequence(sequence: TaskSequence, tx?: Prisma.TransactionClient): Promise<PersistedTask[]> {
    const client = tx ?? this.prisma;

    let tasks;

    try {
      tasks = await client.task.findMany({
        where: {
          sequence: {
            gte: sequence
          }
        },
        orderBy: {
          sequence: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return tasks.map(mapPrismaTaskToDomainTask);
  }

  async listPayloadCleanupCandidates(input: ListPayloadCleanupCandidatesRepositoryInput): Promise<PersistedTask[]> {
    let tasks;

    try {
      tasks = await this.prisma.task.findMany({
        where: {
          state: {
            in: ['completed', 'partially_completed', 'failed']
          },
          payload_id: {
            not: null
          },
          updated_at: {
            lte: input.updatedBefore
          }
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return tasks.map(mapPrismaTaskToDomainTask);
  }

  async listUncommittedCleanupCandidates(
    input: ListUncommittedCleanupCandidatesRepositoryInput
  ): Promise<PersistedTask[]> {
    let tasks;

    try {
      tasks = await this.prisma.task.findMany({
        where: {
          state: 'pending',
          sequence: {
            gt: input.afterSequence
          },
          updated_at: {
            lte: input.updatedBefore
          }
        },
        orderBy: {
          updated_at: 'asc'
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

  /* find methods */

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

  async findBySequence(sequence: TaskSequence): Promise<PersistedTask | null> {
    let task;

    try {
      task = await this.prisma.task.findUnique({
        where: {
          sequence
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return task ? mapPrismaTaskToDomainTask(task) : null;
  }

  /* create methods */

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

          payload_id: input.payloadId,

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

  /* execution methods */

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

  /* update methods */

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

  async clearPayloadId(input: ClearTaskPayloadIdRepositoryInput): Promise<boolean> {
    let clearResult;

    try {
      clearResult = await this.prisma.task.updateMany({
        where: {
          id: input.id,
          revision: input.revision,
          payload_id: {
            not: null
          }
        },
        data: {
          payload_id: null,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return clearResult.count === 1;
  }

  /* delete methods */

  async truncateFromSequence(sequence: TaskSequence, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;

    let truncationResult;

    try {
      truncationResult = await client.task.deleteMany({
        where: {
          sequence: {
            gte: sequence
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return truncationResult.count;
  }
}

/* exports */

export { TaskRepository };
export type { TaskRepositoryContract };
