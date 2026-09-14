import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

/* constants */

export const CONSENSUS_STATE_ID = 'self';

/* field schemas */

export const consensusStateIdSchema = z.string().min(1);
export const consensusEpochSchema = z.bigint().nonnegative();
export const consensusSequenceSchema = z.bigint().nonnegative();
export const consensusLastSequenceSchema = z.bigint().min(-1n);

/* object schemas */

export const consensusStateSchema = z.object({
  id: consensusStateIdSchema,

  currentEpoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema.nullable(),
  lastAllocatedSequence: consensusLastSequenceSchema,
  lastCommittedSequence: consensusLastSequenceSchema,
  lastAppliedSequence: consensusLastSequenceSchema,

  createdAt: z.date(),
  updatedAt: z.date(),

  revision: z.bigint().nonnegative()
});

/* types */

export type ConsensusStateId = z.infer<typeof consensusStateIdSchema>;
export type ConsensusEpoch = z.infer<typeof consensusEpochSchema>;
export type ConsensusSequence = z.infer<typeof consensusSequenceSchema>;
export type ConsensusLastSequence = z.infer<typeof consensusLastSequenceSchema>;

export type ConsensusState = z.infer<typeof consensusStateSchema>;
