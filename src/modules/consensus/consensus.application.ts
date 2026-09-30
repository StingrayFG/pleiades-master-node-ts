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

// leadership context
export const consensusLeadershipContextSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

// sequence
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

// leadership
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

// election
export const startElectionRepositoryInputSchema = z.object({
  expectedEpoch: consensusEpochSchema,
  electionEpoch: consensusEpochSchema,
  electionStarterMasterNodeId: masterNodeIdSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const adoptNewerEpochRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const applyVoteRequestRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  electionStarterMasterNodeId: masterNodeIdSchema,
  electionStarterLogIsUpToDate: z.boolean()
});

export const requestConsensusVoteInputSchema = z.object({
  epoch: consensusEpochSchema,
  electionStarterMasterNodeId: masterNodeIdSchema,
  electionStarterLastLogEpoch: consensusEpochSchema,
  electionStarterLastLogSequence: consensusLastSequenceSchema,
  localLastLogEpoch: consensusEpochSchema,
  localLastLogSequence: consensusLastSequenceSchema
});

export const consensusVoteResultSchema = z.object({
  state: consensusStateSchema,
  voteGranted: z.boolean()
});

/* types */

// leadership context
export type ConsensusLeadershipContext = z.infer<typeof consensusLeadershipContextSchema>;

// sequence
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

// transaction action callbacks use direct types because their Prisma transaction client cannot be schema-derived.

// runs as part of the sequence-allocation transaction and receives the same transaction client.
export type AllocatedSequenceTransactionAction<TResult> = (
  tx: Prisma.TransactionClient,
  allocatedSequence: ConsensusSequence
) => Promise<TResult>;

// runs as part of the sequence-rewind transaction and receives the same transaction client.
export type RewoundSequenceTransactionAction<TResult> = (
  tx: Prisma.TransactionClient,
  rewoundSequence: ConsensusLastSequence
) => Promise<TResult>;

// leadership
export type ClaimLeadershipRepositoryInput = z.infer<typeof claimLeadershipRepositoryInputSchema>;
export type AcceptFollowershipRepositoryInput = z.infer<typeof acceptFollowershipRepositoryInputSchema>;
export type ReleaseLeadershipRepositoryInput = z.infer<typeof releaseLeadershipRepositoryInputSchema>;

// election
export type StartElectionRepositoryInput = z.infer<typeof startElectionRepositoryInputSchema>;
export type AdoptNewerEpochRepositoryInput = z.infer<typeof adoptNewerEpochRepositoryInputSchema>;
export type ApplyVoteRequestRepositoryInput = z.infer<typeof applyVoteRequestRepositoryInputSchema>;
export type RequestConsensusVoteInput = z.infer<typeof requestConsensusVoteInputSchema>;
export type ConsensusVoteResult = z.infer<typeof consensusVoteResultSchema>;
