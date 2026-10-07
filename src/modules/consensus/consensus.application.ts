import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  consensusEpochSchema,
  consensusLeadershipContextSchema,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  consensusStateSchema,
  type ConsensusLastSequence,
  type ConsensusSequence
} from './consensus.domain';

/* service schemas */

// election
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

/* repository schemas */

// sequence
export const advanceSequenceRepositoryInputSchema = z.object({
  sequence: consensusSequenceSchema
});

export const withAdvancedLastAllocatedSequenceRepositoryInputSchema = z.object({
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

/* service types */

// sequence

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

// runs within the leadership-guard transaction; all database work must use the provided transaction client.
export type LeadershipContextTransactionAction<TResult> = (tx: Prisma.TransactionClient) => Promise<TResult>;

// election
export type RequestConsensusVoteInput = z.infer<typeof requestConsensusVoteInputSchema>;
export type ConsensusVoteResult = z.infer<typeof consensusVoteResultSchema>;

/* repository types */

// sequence
export type AdvanceSequenceRepositoryInput = z.infer<typeof advanceSequenceRepositoryInputSchema>;
export type WithAdvancedLastAllocatedSequenceRepositoryInput = z.infer<
  typeof withAdvancedLastAllocatedSequenceRepositoryInputSchema
>;

// leadership
export type ClaimLeadershipRepositoryInput = z.infer<typeof claimLeadershipRepositoryInputSchema>;
export type AcceptFollowershipRepositoryInput = z.infer<typeof acceptFollowershipRepositoryInputSchema>;
export type ReleaseLeadershipRepositoryInput = z.infer<typeof releaseLeadershipRepositoryInputSchema>;

// election
export type StartElectionRepositoryInput = z.infer<typeof startElectionRepositoryInputSchema>;
export type AdoptNewerEpochRepositoryInput = z.infer<typeof adoptNewerEpochRepositoryInputSchema>;
export type ApplyVoteRequestRepositoryInput = z.infer<typeof applyVoteRequestRepositoryInputSchema>;
