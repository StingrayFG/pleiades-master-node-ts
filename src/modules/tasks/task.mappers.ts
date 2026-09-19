import type { Task as PrismaTask, TaskExecution as PrismaTaskExecution } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { persistedTaskSchema, taskExecutionSchema, type PersistedTask, type TaskExecution } from './task.domain';

/* prisma -> domain */

export const mapPrismaTaskToDomainTask = (task: PrismaTask): PersistedTask => {
  return withMapperError('Failed to map Prisma task to domain task', () => {
    return persistedTaskSchema.parse({
      id: task.id,

      originMasterNodeId: task.origin_master_id,
      epoch: task.epoch,
      sequence: task.sequence,

      state: task.state,

      revision: task.revision,

      type: task.type,
      data: task.data,
      executionScope: task.execution_scope,

      payloadId: task.payload_id,

      createdAt: task.created_at,
      updatedAt: task.updated_at
    });
  });
};

export const mapPrismaTaskExecutionToDomainTaskExecution = (execution: PrismaTaskExecution): TaskExecution => {
  return withMapperError('Failed to map Prisma task execution to domain task execution', () => {
    return taskExecutionSchema.parse({
      id: execution.id,
      taskId: execution.task_id,

      targetMasterId: execution.target_master_id,

      state: execution.state,
      failureReason: execution.failure_reason,

      createdAt: execution.created_at,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
      updatedAt: execution.updated_at,

      revision: execution.revision
    });
  });
};
