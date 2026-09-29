import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  consensusEpochSchema,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  type ConsensusLastSequence,
  type ConsensusSequence,
  type ConsensusState
} from './consensus.domain';

/* schemas */

export const consensusLeadershipContextSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

export const advanceLastCommittedSequenceRepositoryInputSchema = consensusLeadershipContextSchema.extend({
  sequence: consensusSequenceSchema
});

export const advanceLastAppliedSequenceRepositoryInputSchema = z.object({
  sequence: consensusSequenceSchema
});

export const advanceLastAllocatedSequenceRepositoryInputSchema = consensusLeadershipContextSchema.extend({
  sequence: consensusSequenceSchema
});

export const advanceLastMatchedSequenceRepositoryInputSchema = consensusLeadershipContextSchema.extend({
  sequence: consensusLastSequenceSchema
});

export const withAdvancedLastAllocatedSequenceRepositoryInputSchema = consensusLeadershipContextSchema;

export const withRewoundLastAllocatedSequenceRepositoryInputSchema = consensusLeadershipContextSchema.extend({
  sequence: consensusLastSequenceSchema
});

export const claimLeadershipRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema,
  lastLeaderContactAt: z.date(),
  matchedSequence: consensusLastSequenceSchema
});

export const acceptFollowershipRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema,
  lastLeaderContactAt: z.date(),
  matchedSequence: consensusLastSequenceSchema
});

export const releaseLeadershipRepositoryInputSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const startElectionRepositoryInputSchema = z.object({
  expectedEpoch: consensusEpochSchema,
  electionEpoch: consensusEpochSchema,
  candidateMasterNodeId: masterNodeIdSchema,
  matchedSequence: consensusLastSequenceSchema
});

export const observeEpochRepositoryInputSchema = z.object({
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

/* types */

export type ConsensusLeadershipContext = z.infer<typeof consensusLeadershipContextSchema>;
export type AdvanceLastCommittedSequenceRepositoryInput = z.infer<
  typeof advanceLastCommittedSequenceRepositoryInputSchema
>;
export type AdvanceLastAppliedSequenceRepositoryInput = z.infer<typeof advanceLastAppliedSequenceRepositoryInputSchema>;
export type AdvanceLastAllocatedSequenceRepositoryInput = z.infer<
  typeof advanceLastAllocatedSequenceRepositoryInputSchema
>;
export type AdvanceLastMatchedSequenceRepositoryInput = z.infer<typeof advanceLastMatchedSequenceRepositoryInputSchema>;
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
export type ObserveEpochRepositoryInput = z.infer<typeof observeEpochRepositoryInputSchema>;
export type ApplyVoteRequestRepositoryInput = z.infer<typeof applyVoteRequestRepositoryInputSchema>;
export type RequestConsensusVoteInput = z.infer<typeof requestConsensusVoteInputSchema>;

export type ConsensusVoteResult = {
  state: ConsensusState;
  voteGranted: boolean;
};

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
