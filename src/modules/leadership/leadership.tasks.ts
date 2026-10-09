import { z } from 'zod';

import { createTaskDefinition } from '@/modules/tasks/task.definition';

/* data schemas */

export const leadershipBarrierTaskDataSchema = z.object({});

/* definitions */

export const leadershipBarrierTaskDefinition = createTaskDefinition({
  type: 'leadership.barrier',
  executionScope: 'cluster',
  forwardable: false,

  dataSchema: leadershipBarrierTaskDataSchema
});
