import type { Task as PrismaTask, TaskExecution as PrismaTaskExecution } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { PersistedTask, TaskExecution } from '../task.domain';
import { mapPrismaTaskExecutionToDomainTaskExecution, mapPrismaTaskToDomainTask } from '../task.mappers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaTask: PrismaTask = {
  id: '00000000-0000-4000-8000-000000000001',
  origin_master_id: 'master-node-7e5700000003',
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
  target_master_id: 'master-node-7e5700000003',
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

/* tests */

describe('task mappers', () => {
  test('maps Prisma task and execution rows to domain entities', () => {
    expect(mapPrismaTaskToDomainTask(prismaTask)).toEqual(task);
    expect(mapPrismaTaskExecutionToDomainTaskExecution(prismaExecution)).toEqual(execution);
  });

  test('wraps invalid Prisma task data in a mapper error', () => {
    expect(() => mapPrismaTaskToDomainTask({ ...prismaTask, id: 'invalid' })).toThrow(GenericMapperError);
  });

  test('wraps invalid Prisma execution data in a mapper error', () => {
    expect(() => mapPrismaTaskExecutionToDomainTaskExecution({ ...prismaExecution, revision: -1n })).toThrow(
      GenericMapperError
    );
  });
});
