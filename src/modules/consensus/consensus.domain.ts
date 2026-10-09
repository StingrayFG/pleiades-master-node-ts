import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

/* constants */

export const CONSENSUS_STATE_ID = 'self';
export const CONSENSUS_VOTING_CONFIGURATION_PHASES = ['stable', 'joint'] as const;

/* field schemas */

export const consensusStateIdSchema = z.string().min(1);
export const consensusEpochSchema = z.bigint().nonnegative();
export const consensusSequenceSchema = z.bigint().nonnegative();
export const consensusLastSequenceSchema = z.bigint().min(-1n);
export const consensusVotingConfigurationPhaseSchema = z.enum(CONSENSUS_VOTING_CONFIGURATION_PHASES);

/* object schemas */

export const consensusLogPositionSchema = z.object({
  epoch: consensusEpochSchema,
  sequence: consensusLastSequenceSchema
});

export const consensusLeadershipContextSchema = z.object({
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

export const consensusLeadershipContextWithSequenceSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema,
  sequence: consensusSequenceSchema
});

export const consensusLeadershipContextWithLastSequenceSchema = z.object({
  leadershipContext: consensusLeadershipContextSchema,
  sequence: consensusLastSequenceSchema
});

const consensusVoterMasterNodeIdsSchema = z
  .array(masterNodeIdSchema)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'Voting configuration contains duplicate master node IDs');

export const stableConsensusVotingConfigurationSchema = z.object({
  phase: z.literal('stable'),
  voterMasterNodeIds: consensusVoterMasterNodeIdsSchema
});

export const jointConsensusVotingConfigurationSchema = z.object({
  phase: z.literal('joint'),
  previousVoterMasterNodeIds: consensusVoterMasterNodeIdsSchema,
  nextVoterMasterNodeIds: consensusVoterMasterNodeIdsSchema
});

export const consensusVotingConfigurationSchema = z.discriminatedUnion('phase', [
  stableConsensusVotingConfigurationSchema,
  jointConsensusVotingConfigurationSchema
]);

export const consensusStateSchema = z
  .object({
    id: consensusStateIdSchema,

    currentEpoch: consensusEpochSchema,
    leaderMasterId: masterNodeIdSchema.nullable(),
    votedForMasterId: masterNodeIdSchema.nullable(),
    lastLeaderContactAt: z.date().nullable(),

    lastAllocatedSequence: consensusLastSequenceSchema,
    lastMatchedSequence: consensusLastSequenceSchema,
    lastCommittedSequence: consensusLastSequenceSchema,
    lastAppliedSequence: consensusLastSequenceSchema,

    createdAt: z.date(),
    updatedAt: z.date(),

    revision: z.bigint().nonnegative()
  })
  .refine((state) => state.lastCommittedSequence <= state.lastAllocatedSequence, {
    message: 'Committed sequence cannot exceed allocated sequence'
  })
  .refine((state) => state.lastMatchedSequence <= state.lastAllocatedSequence, {
    message: 'Matched sequence cannot exceed allocated sequence'
  })
  .refine((state) => state.lastAppliedSequence <= state.lastCommittedSequence, {
    message: 'Applied sequence cannot exceed committed sequence'
  })
  .refine((state) => state.leaderMasterId === null || state.votedForMasterId === state.leaderMasterId, {
    message: 'The current leader must match the vote recorded for the current epoch'
  })
  .refine((state) => (state.leaderMasterId === null) === (state.lastLeaderContactAt === null), {
    message: 'Leader contact time must be present exactly when a leader is known'
  });

/* field types */

export type ConsensusStateId = z.infer<typeof consensusStateIdSchema>;
export type ConsensusEpoch = z.infer<typeof consensusEpochSchema>;
export type ConsensusSequence = z.infer<typeof consensusSequenceSchema>;
export type ConsensusLastSequence = z.infer<typeof consensusLastSequenceSchema>;
export type ConsensusVotingConfigurationPhase = z.infer<typeof consensusVotingConfigurationPhaseSchema>;

/* object types */

export type ConsensusLogPosition = z.infer<typeof consensusLogPositionSchema>;
export type ConsensusLeadershipContext = z.infer<typeof consensusLeadershipContextSchema>;
export type ConsensusLeadershipContextWithSequence = z.infer<typeof consensusLeadershipContextWithSequenceSchema>;
export type ConsensusLeadershipContextWithLastSequence = z.infer<
  typeof consensusLeadershipContextWithLastSequenceSchema
>;
export type StableConsensusVotingConfiguration = z.infer<typeof stableConsensusVotingConfigurationSchema>;
export type JointConsensusVotingConfiguration = z.infer<typeof jointConsensusVotingConfigurationSchema>;
export type ConsensusVotingConfiguration = z.infer<typeof consensusVotingConfigurationSchema>;
export type ConsensusState = z.infer<typeof consensusStateSchema>;
