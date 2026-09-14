import { z } from 'zod';

import { consensusEpochSchema } from '@/modules/consensus/consensus.domain';
import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import { masterBootstrapRoleSchema } from './bootstrap.domain';

/* schemas */

export const masterBootstrapResultSchema = z.object({
  role: masterBootstrapRoleSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema.nullable()
});

/* types */

export type MasterBootstrapResult = z.infer<typeof masterBootstrapResultSchema>;
