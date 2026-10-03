import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskDefinition, TaskDefinitionData, TaskDefinitionResult } from './task.definition';

/* contract */

type TaskForwarderContract = {
  forwardTask<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>,
    leaderMasterId: MasterNodeId
  ): Promise<TaskDefinitionResult<TDefinition>>;
};

/* exports */

export type { TaskForwarderContract };
