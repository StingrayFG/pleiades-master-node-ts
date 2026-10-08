import type {
  Task as PrismaTask,
  TaskExecution as PrismaTaskExecution,
  TaskSubmission as PrismaTaskSubmission
} from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import {
  persistedTaskSchema,
  taskExecutionSchema,
  taskSubmissionSchema,
  type PersistedTask,
  type TaskExecution,
  type TaskSubmission
} from './task.domain';

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

export const mapPrismaTaskSubmissionToDomainTaskSubmission = (submission: PrismaTaskSubmission): TaskSubmission => {
  return withMapperError('Failed to map Prisma task submission to domain', () => {
    return taskSubmissionSchema.parse({
      id: submission.id,

      originMasterNodeId: submission.origin_master_id,

      type: submission.type,
      data: submission.data,
      executionScope: submission.execution_scope,
      targetMasterIds: submission.target_master_ids,

      payloadId: submission.payload_id,

      state: submission.state,

      createdAt: submission.created_at,
      updatedAt: submission.updated_at,

      revision: submission.revision
    });
  });
};
