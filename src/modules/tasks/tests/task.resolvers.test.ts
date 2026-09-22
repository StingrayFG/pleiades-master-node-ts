import { describe, expect, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';

import type { TaskExecution, TaskExecutionState } from '../task.domain';
import { resolveTaskStateFromExecutions, resolveTaskTargetsFromScope } from '../task.resolvers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const createExecution = (state: TaskExecutionState): TaskExecution => ({
  id: '00000000-0000-4000-8000-000000000001',
  taskId: '00000000-0000-4000-8000-000000000002',
  targetMasterId: 'master-node-test',
  state,
  failureReason: state === 'failed' ? 'failed' : null,
  createdAt: now,
  startedAt: null,
  completedAt: null,
  updatedAt: now,
  revision: 0n
});

/* tests */

describe('task resolvers', () => {
  test.each([
    { executions: [], expected: 'pending' },
    { executions: [createExecution('completed')], expected: 'completed' },
    { executions: [createExecution('failed')], expected: 'failed' },
    {
      executions: [createExecution('completed'), createExecution('failed')],
      expected: 'partially_completed'
    },
    {
      executions: [createExecution('completed'), createExecution('pending')],
      expected: 'pending'
    },
    {
      executions: [createExecution('failed'), createExecution('executing')],
      expected: 'pending'
    }
  ] as const)('resolves execution states to $expected', ({ executions, expected }) => {
    expect(resolveTaskStateFromExecutions([...executions])).toBe(expected);
  });

  test.each(['local', 'cluster'] as const)('resolves %s execution to the current master node', (scope) => {
    expect(resolveTaskTargetsFromScope(scope, 'master-node-test')).toEqual(['master-node-test']);
  });

  test('rejects unsupported execution scopes', () => {
    expect(() => resolveTaskTargetsFromScope('unsupported' as never, 'master-node-test')).toThrow(
      GenericInternalServerError
    );
  });
});
