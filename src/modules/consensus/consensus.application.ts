import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  consensusEpochSchema,
  ConsensusSequence,
  consensusSequenceSchema,
  consensusStateIdSchema
} from './consensus.domain';

/* schemas */

export const advanceLastCommittedSequenceRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  sequence: consensusSequenceSchema
});

export const advanceLastAppliedSequenceRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  sequence: consensusSequenceSchema
});

export const advanceLastAllocatedSequenceRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  sequence: consensusSequenceSchema
});

export const claimLeadershipRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

export const acceptFollowershipRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

/* types */

export type AdvanceLastCommittedSequenceRepositoryInput = z.infer<
  typeof advanceLastCommittedSequenceRepositoryInputSchema
>;
export type AdvanceLastAppliedSequenceRepositoryInput = z.infer<typeof advanceLastAppliedSequenceRepositoryInputSchema>;
export type AdvanceLastAllocatedSequenceRepositoryInput = z.infer<typeof advanceLastAllocatedSequenceRepositoryInputSchema>;
export type ClaimLeadershipRepositoryInput = z.infer<typeof claimLeadershipRepositoryInputSchema>;
export type AcceptFollowershipRepositoryInput = z.infer<typeof acceptFollowershipRepositoryInputSchema>;

// runs within the sequence-allocation transaction; all database work must use the provided transaction client.
export type AllocatedSequenceTransactionAction<TResult> = (
  tx: Prisma.TransactionClient,
  allocatedSequence: ConsensusSequence
) => Promise<TResult>;
