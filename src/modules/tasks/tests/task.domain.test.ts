import { describe, expect, test } from '@jest/globals';

import { persistedTaskSchema, taskBaseSchema, taskExecutionSchema } from '../task.domain';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const taskBase = {
  id: '00000000-0000-4000-8000-000000000001',
  originMasterNodeId: 'master-node-test',
  epoch: 1n,
  sequence: 2n,
  state: 'pending' as const,
  revision: 0n
};

/* tests */

describe('task domain schemas', () => {
  test('parses a task base', () => {
    expect(taskBaseSchema.parse(taskBase)).toEqual(taskBase);
  });

  test('parses a persisted task with inline data and an optional payload reference', () => {
    const task = {
      ...taskBase,
      type: 'test.execute',
      data: { value: 'test' },
      executionScope: 'local' as const,
      payloadId: '00000000-0000-4000-8000-000000000002',
      createdAt: now,
      updatedAt: now
    };

    expect(persistedTaskSchema.parse(task)).toEqual(task);
    expect(persistedTaskSchema.parse({ ...task, payloadId: null })).toEqual({ ...task, payloadId: null });
  });

  test('rejects invalid task identity, state, and revision values', () => {
    expect(taskBaseSchema.safeParse({ ...taskBase, id: 'not-a-uuid' }).success).toBe(false);
    expect(taskBaseSchema.safeParse({ ...taskBase, state: 'unknown' }).success).toBe(false);
    expect(taskBaseSchema.safeParse({ ...taskBase, revision: -1n }).success).toBe(false);
  });

  test('parses task execution lifecycle fields', () => {
    const execution = {
      id: '00000000-0000-4000-8000-000000000003',
      taskId: taskBase.id,
      targetMasterId: 'master-node-test',
      state: 'executing' as const,
      failureReason: null,
      createdAt: now,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
      revision: 1n
    };

    expect(taskExecutionSchema.parse(execution)).toEqual(execution);
  });
});
