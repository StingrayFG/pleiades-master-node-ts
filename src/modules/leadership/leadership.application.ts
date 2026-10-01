import { z } from 'zod';

import { consensusEpochSchema, consensusLastSequenceSchema } from '@/modules/consensus/consensus.domain';
import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

/* schemas */

export const recordLeaderHeartbeatInputSchema = z.object({
  leaderMasterNodeId: masterNodeIdSchema,
  epoch: consensusEpochSchema,
  lastCommittedSequence: consensusLastSequenceSchema
});

export const recordLeaderHeartbeatResultSchema = z.object({
  epoch: consensusEpochSchema,
  lastMatchedSequence: consensusLastSequenceSchema,
  accepted: z.boolean()
});

/* types */

export type RecordLeaderHeartbeatInput = z.infer<typeof recordLeaderHeartbeatInputSchema>;
export type RecordLeaderHeartbeatResult = z.infer<typeof recordLeaderHeartbeatResultSchema>;
