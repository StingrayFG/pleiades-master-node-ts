import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskDefinitionContract } from './task.definition';
import type { TaskExecutionScope } from './task.domain';

/* contract */

type TaskForwarderContract = {
  forwardTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    data: TData,
    leaderMasterId: MasterNodeId
  ): Promise<TResult>;
};

/* exports */

export type { TaskForwarderContract };
