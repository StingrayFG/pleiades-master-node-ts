import { GenericInternalServerError } from '@/errors/application.errors';

import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskExecution, TaskExecutionScope, TaskState } from './task.domain';

/* resolvers */

export const resolveTaskStateFromExecutions = (executions: TaskExecution[]): TaskState => {
  if (executions.length === 0) {
    return 'pending';
  }

  const completed = executions.filter((execution) => execution.state === 'completed').length;

  const failed = executions.filter((execution) => execution.state === 'failed').length;

  if (completed + failed < executions.length) {
    return 'pending';
  }

  if (completed === executions.length) {
    return 'completed';
  }

  if (failed === executions.length) {
    return 'failed';
  }

  if (completed > 0) {
    return 'partially_completed';
  }

  return 'pending';
};

export const resolveTaskTargetsFromScope = (
  scope: TaskExecutionScope,
  selfMasterNodeId: MasterNodeId
): MasterNodeId[] => {
  switch (scope) {
    case 'local':
      return [selfMasterNodeId];
    case 'cluster':
      return [selfMasterNodeId];
    default:
      throw new GenericInternalServerError(`Unsupported task execution scope: ${String(scope)}`);
  }
};
