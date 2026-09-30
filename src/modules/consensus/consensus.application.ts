import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  consensusEpochSchema,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  consensusStateSchema,
  type ConsensusLastSequence,
  type ConsensusSequence
} from './consensus.domain';

/* schemas */

export const consensusLeadershipContextSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

export const advanceSequenceRepositoryInputSchema = z.object({
  sequence: consensusSequenceSchema
});

export const advanceLeadershipSequenceRepositoryInputSchema = advanceSequenceRepositoryInputSchema.extend({
  leadershipContext: consensusLeadershipContextSchema
});

export const advanceLeadershipLastSequenceRepositoryInputSchema = z.object({
  sequence: consensusLastSequenceSchema,
  leadershipContext: consensusLeadershipContextSchema
});

export const withAdvancedLastAllocatedSequenceRepositoryInputSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema
});

export const withRewoundLastAllocatedSequenceRepositoryInputSchema = z.object({
  sequence: consensusLastSequenceSchema,
  leadershipContext: consensusLeadershipContextSchema
});

export const claimLeadershipRepositoryInputSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema,
  lastLeaderContactAt: z.date(),
  matchedSequence: consensusLastSequenceSchema
});

export const acceptFollowershipRepositoryInputSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema,
  lastLeaderContactAt: z.date(),
  matchedSequence: consensusLastSequenceSchema
});

export const releaseLeadershipRepositoryInputSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const startElectionRepositoryInputSchema = z.object({
  expectedEpoch: consensusEpochSchema,
  electionEpoch: consensusEpochSchema,
  candidateMasterNodeId: masterNodeIdSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const adoptNewerEpochRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const applyVoteRequestRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  candidateMasterNodeId: masterNodeIdSchema,
  candidateLogIsUpToDate: z.boolean()
});

export const requestConsensusVoteInputSchema = z.object({
  epoch: consensusEpochSchema,
  candidateMasterNodeId: masterNodeIdSchema,
  candidateLastLogEpoch: consensusEpochSchema,
  candidateLastLogSequence: consensusLastSequenceSchema,
  localLastLogEpoch: consensusEpochSchema,
  localLastLogSequence: consensusLastSequenceSchema
});

export const consensusVoteResultSchema = z.object({
  state: consensusStateSchema,
  voteGranted: z.boolean()
});

/* types */

export type ConsensusLeadershipContext = z.infer<typeof consensusLeadershipContextSchema>;

export type AdvanceSequenceRepositoryInput = z.infer<typeof advanceSequenceRepositoryInputSchema>;
export type AdvanceLeadershipSequenceRepositoryInput = z.infer<typeof advanceLeadershipSequenceRepositoryInputSchema>;
export type AdvanceLeadershipLastSequenceRepositoryInput = z.infer<
  typeof advanceLeadershipLastSequenceRepositoryInputSchema
>;
export type WithAdvancedLastAllocatedSequenceRepositoryInput = z.infer<
  typeof withAdvancedLastAllocatedSequenceRepositoryInputSchema
>;
export type WithRewoundLastAllocatedSequenceRepositoryInput = z.infer<
  typeof withRewoundLastAllocatedSequenceRepositoryInputSchema
>;

export type ClaimLeadershipRepositoryInput = z.infer<typeof claimLeadershipRepositoryInputSchema>;
export type AcceptFollowershipRepositoryInput = z.infer<typeof acceptFollowershipRepositoryInputSchema>;
export type ReleaseLeadershipRepositoryInput = z.infer<typeof releaseLeadershipRepositoryInputSchema>;

export type StartElectionRepositoryInput = z.infer<typeof startElectionRepositoryInputSchema>;
export type AdoptNewerEpochRepositoryInput = z.infer<typeof adoptNewerEpochRepositoryInputSchema>;
export type ApplyVoteRequestRepositoryInput = z.infer<typeof applyVoteRequestRepositoryInputSchema>;
export type RequestConsensusVoteInput = z.infer<typeof requestConsensusVoteInputSchema>;
export type ConsensusVoteResult = z.infer<typeof consensusVoteResultSchema>;

// runs within the sequence-allocation transaction; all database work must use the provided transaction client.
export type AllocatedSequenceTransactionAction<TResult> = (
  tx: Prisma.TransactionClient,
  allocatedSequence: ConsensusSequence
) => Promise<TResult>;

// runs within the sequence-rewind transaction; all database work must use the provided transaction client.
export type RewoundSequenceTransactionAction<TResult> = (
  tx: Prisma.TransactionClient,
  rewoundSequence: ConsensusLastSequence
) => Promise<TResult>;
