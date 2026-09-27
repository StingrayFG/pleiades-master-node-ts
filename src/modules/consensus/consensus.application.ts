import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  consensusEpochSchema,
  type ConsensusLastSequence,
  type ConsensusSequence,
  consensusLastSequenceSchema,
  consensusSequenceSchema,
  consensusStateIdSchema,
  type ConsensusState
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
  leaderMasterId: masterNodeIdSchema,
  lastLeaderContactAt: z.date()
});

export const acceptFollowershipRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema,
  lastLeaderContactAt: z.date()
});

export const relinquishLeadershipRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

export const startElectionRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  expectedEpoch: consensusEpochSchema,
  electionEpoch: consensusEpochSchema,
  candidateMasterNodeId: masterNodeIdSchema
});

export const observeEpochRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
  epoch: consensusEpochSchema
});

export const applyVoteRequestRepositoryInputSchema = z.object({
  id: consensusStateIdSchema,
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

export type AdvanceLastCommittedSequenceRepositoryInput = z.infer<
  typeof advanceLastCommittedSequenceRepositoryInputSchema
>;
export type AdvanceLastAppliedSequenceRepositoryInput = z.infer<typeof advanceLastAppliedSequenceRepositoryInputSchema>;
export type AdvanceLastAllocatedSequenceRepositoryInput = z.infer<
  typeof advanceLastAllocatedSequenceRepositoryInputSchema
>;
export type ClaimLeadershipRepositoryInput = z.infer<typeof claimLeadershipRepositoryInputSchema>;
export type AcceptFollowershipRepositoryInput = z.infer<typeof acceptFollowershipRepositoryInputSchema>;
export type RelinquishLeadershipRepositoryInput = z.infer<typeof relinquishLeadershipRepositoryInputSchema>;
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
