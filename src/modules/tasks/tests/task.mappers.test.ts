import type {
  Task as PrismaTask,
  TaskExecution as PrismaTaskExecution,
  TaskSubmission as PrismaTaskSubmission
} from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { PersistedTask, TaskExecution, TaskSubmission } from '../task.domain';
import {
  mapPrismaTaskExecutionToDomainTaskExecution,
  mapPrismaTaskSubmissionToDomainTaskSubmission,
  mapPrismaTaskToDomainTask
} from '../task.mappers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaTask: PrismaTask = {
  id: '00000000-0000-4000-8000-000000000001',
  origin_master_id: 'master-node-aaaaaaaaaaaa',
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
  state: prismaTask.state,
  revision: prismaTask.revision,
  type: prismaTask.type,
  data: prismaTask.data,
  executionScope: prismaTask.execution_scope,
  payloadId: prismaTask.payload_id,
  createdAt: prismaTask.created_at,
  updatedAt: prismaTask.updated_at
};

const prismaExecution: PrismaTaskExecution = {
  id: '00000000-0000-4000-8000-000000000002',
  task_id: prismaTask.id,
  target_master_id: 'master-node-aaaaaaaaaaaa',
  state: 'completed',
  failure_reason: null,
  created_at: now,
  started_at: now,
  completed_at: now,
  updated_at: now,
  revision: 2n
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

const prismaSubmission: PrismaTaskSubmission = {
  id: '00000000-0000-4000-8000-000000000003',
  origin_master_id: 'master-node-aaaaaaaaaaaa',
  type: 'test.execute',
  data: { value: 'test' },
  execution_scope: 'cluster',
  target_master_ids: ['master-node-aaaaaaaaaaaa'],
  payload_id: null,
  state: 'pending',
  created_at: now,
  updated_at: now,
  revision: 0n
};

const submission: TaskSubmission = {
  id: prismaSubmission.id,
  originMasterNodeId: prismaSubmission.origin_master_id,
  type: prismaSubmission.type,
  data: prismaSubmission.data,
  executionScope: prismaSubmission.execution_scope,
  targetMasterIds: ['master-node-aaaaaaaaaaaa'],
  payloadId: prismaSubmission.payload_id,
  state: prismaSubmission.state,
  createdAt: prismaSubmission.created_at,
  updatedAt: prismaSubmission.updated_at,
  revision: prismaSubmission.revision
};

/* tests */

describe('task mappers', () => {
  test('maps Prisma task, execution, and submission rows to domain entities', () => {
    expect(mapPrismaTaskToDomainTask(prismaTask)).toEqual(task);
    expect(mapPrismaTaskExecutionToDomainTaskExecution(prismaExecution)).toEqual(execution);
    expect(mapPrismaTaskSubmissionToDomainTaskSubmission(prismaSubmission)).toEqual(submission);
  });

  test('wraps invalid Prisma task data in a mapper error', () => {
    expect(() => mapPrismaTaskToDomainTask({ ...prismaTask, id: 'invalid' })).toThrow(GenericMapperError);
  });

  test('wraps invalid Prisma execution data in a mapper error', () => {
    expect(() => mapPrismaTaskExecutionToDomainTaskExecution({ ...prismaExecution, revision: -1n })).toThrow(
      GenericMapperError
    );
  });

  test('wraps invalid Prisma submission data in a mapper error', () => {
    expect(() =>
      mapPrismaTaskSubmissionToDomainTaskSubmission({ ...prismaSubmission, target_master_ids: ['invalid'] })
    ).toThrow(GenericMapperError);
  });
});
