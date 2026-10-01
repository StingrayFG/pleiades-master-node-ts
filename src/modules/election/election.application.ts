import { z } from 'zod';

import { consensusEpochSchema, consensusLastSequenceSchema } from '@/modules/consensus/consensus.domain';
import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

/* schemas */

export const requestVoteInputSchema = z.object({
  electionStarterMasterNodeId: masterNodeIdSchema,
  epoch: consensusEpochSchema,
  lastLogEpoch: consensusEpochSchema,
  lastLogSequence: consensusLastSequenceSchema
});

export const requestVoteResultSchema = z.object({
  epoch: consensusEpochSchema,
  voteGranted: z.boolean()
});

/* types */

export type RequestVoteInput = z.infer<typeof requestVoteInputSchema>;
export type RequestVoteResult = z.infer<typeof requestVoteResultSchema>;
