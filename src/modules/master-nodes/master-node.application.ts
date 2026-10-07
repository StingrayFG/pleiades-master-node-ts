import { z } from 'zod';

import { clusterIdSchema, clusterMembershipRevisionSchema } from '@/modules/cluster/cluster.domain';
import { consensusLeadershipContextSchema } from '@/modules/consensus/consensus.domain';
import {
  consensusEpochSchema,
  consensusLastSequenceSchema,
  consensusStateSchema
} from '@/modules/consensus/consensus.domain';
import {
  taskEpochSchema,
  taskExecutionScopeSchema,
  taskIdSchema,
  taskPayloadIdSchema,
  taskSequenceSchema,
  taskTypeSchema
} from '@/modules/tasks/task.domain';

import {
  masterNodeCertificateFingerprintSchema,
  masterNodeEndpointSchema,
  masterNodeIdSchema,
  masterNodeModeSchema,
  masterNodeSessionIdSchema,
  masterNodeStateSchema
} from './master-node.domain';

/* service schemas */

export const registerMasterNodeInputSchema = z.object({
  id: masterNodeIdSchema,

  certificateFingerprint: masterNodeCertificateFingerprintSchema,
  sessionId: masterNodeSessionIdSchema,
  state: masterNodeStateSchema,
  mode: masterNodeModeSchema,

  endpoint: masterNodeEndpointSchema
});

export const applyMasterNodeHeartbeatInputSchema = z.object({
  id: masterNodeIdSchema,
  sessionId: masterNodeSessionIdSchema
});

/* internode schemas */

export const authenticatedMasterNodeCallerSchema = z.object({
  callerMasterNodeId: masterNodeIdSchema,
  callerMasterNodeSessionId: masterNodeSessionIdSchema,
  callerCertificateFingerprint: masterNodeCertificateFingerprintSchema
});

export const internodeTaskEntrySchema = z.object({
  id: taskIdSchema,

  originMasterNodeId: masterNodeIdSchema,
  epoch: taskEpochSchema,
  sequence: taskSequenceSchema,

  type: taskTypeSchema,
  executionScope: taskExecutionScopeSchema,
  data: z.unknown(),

  payloadId: taskPayloadIdSchema.nullable(),

  createdAt: z.date()
});

export const fetchMasterInfoInternodeResultSchema = z.object({
  masterId: masterNodeIdSchema,
  sessionId: masterNodeSessionIdSchema,
  clusterId: clusterIdSchema,

  epoch: taskEpochSchema
});

export const registerMasterNodeInternodeInputSchema = z.object({
  id: masterNodeIdSchema,

  certificateFingerprint: masterNodeCertificateFingerprintSchema,
  sessionId: masterNodeSessionIdSchema,
  clusterId: clusterIdSchema,

  endpoint: masterNodeEndpointSchema
});

export const fetchClusterMembershipSnapshotInternodeInputSchema = authenticatedMasterNodeCallerSchema;

export const fetchTaskEntriesInternodeInputSchema = authenticatedMasterNodeCallerSchema.extend({
  afterSequence: consensusLastSequenceSchema,
  limit: z.number().int().positive().max(128)
});

export const fetchTaskEntriesInternodeResultSchema = z.object({
  epoch: taskEpochSchema,
  lastCommittedSequence: consensusLastSequenceSchema,
  clusterMembershipRevision: clusterMembershipRevisionSchema,

  entries: z.array(internodeTaskEntrySchema)
});

export const fetchTaskPayloadInternodeInputSchema = authenticatedMasterNodeCallerSchema.extend({
  payloadId: taskPayloadIdSchema
});

export const forwardTaskInternodeInputSchema = authenticatedMasterNodeCallerSchema.extend({
  type: taskTypeSchema,
  data: z.unknown()
});

export const requestVoteInternodeInputSchema = authenticatedMasterNodeCallerSchema.extend({
  epoch: consensusEpochSchema,
  lastLogEpoch: consensusEpochSchema,
  lastLogSequence: consensusLastSequenceSchema
});

export const recordLeaderHeartbeatInternodeInputSchema = authenticatedMasterNodeCallerSchema.extend({
  epoch: consensusEpochSchema,
  lastCommittedSequence: consensusLastSequenceSchema
});

/* client schemas */

export const fetchMasterInfoClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema
});

export const registerMasterNodeClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  id: masterNodeIdSchema,
  sessionId: masterNodeSessionIdSchema,
  clusterId: clusterIdSchema,
  endpoint: masterNodeEndpointSchema
});

export const fetchClusterMembershipSnapshotClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema
});

export const fetchTaskEntriesClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  afterSequence: consensusLastSequenceSchema,
  limit: z.number().int().positive().max(128)
});

export const fetchTaskPayloadClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  payloadId: taskPayloadIdSchema
});

export const forwardTaskClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  type: taskTypeSchema,
  data: z.instanceof(Buffer)
});

export const requestVoteClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  epoch: consensusEpochSchema,
  lastLogEpoch: consensusEpochSchema,
  lastLogSequence: consensusLastSequenceSchema
});

export const recordLeaderHeartbeatClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,
  expectedCertificateFingerprint: masterNodeCertificateFingerprintSchema,

  epoch: consensusEpochSchema,
  lastCommittedSequence: consensusLastSequenceSchema
});

/* cluster synchronization handler schemas */

export const synchronizeClusterMembershipInputSchema = fetchClusterMembershipSnapshotClientInputSchema.extend({
  leaderMembershipRevision: clusterMembershipRevisionSchema
});

/* task replication handler schemas */

export const verifyTaskEntriesFetchResultInputSchema = z.object({
  consensusState: consensusStateSchema,
  fetchResult: fetchTaskEntriesInternodeResultSchema
});

export const replicateTaskEntriesInputSchema = fetchClusterMembershipSnapshotClientInputSchema.extend({
  entries: z.array(internodeTaskEntrySchema),
  initialSequence: consensusLastSequenceSchema,
  leaderLastCommittedSequence: consensusLastSequenceSchema,
  leadershipContext: consensusLeadershipContextSchema
});

export const replicateTaskEntryInputSchema = fetchClusterMembershipSnapshotClientInputSchema.extend({
  entry: internodeTaskEntrySchema,
  leadershipContext: consensusLeadershipContextSchema
});

export const reconcileTaskHistoryInputSchema = z.object({
  consensusState: consensusStateSchema,
  replicatedThroughSequence: consensusLastSequenceSchema,
  leaderLastCommittedSequence: consensusLastSequenceSchema,
  leadershipContext: consensusLeadershipContextSchema
});

/* repository schemas */

export const applyMasterNodeRegistrationRepositoryInputSchema = registerMasterNodeInputSchema.extend({
  lastContactAt: z.date()
});

export const applyMasterNodeHeartbeatRepositoryInputSchema = applyMasterNodeHeartbeatInputSchema.extend({
  lastContactAt: z.date(),
  lastHeartbeatAt: z.date()
});

export const transitionMasterNodeModeRepositoryInputSchema = z.object({
  id: masterNodeIdSchema,

  from: masterNodeModeSchema,
  to: masterNodeModeSchema,

  expectedRevision: z.bigint().nonnegative()
});

/* service types */

export type RegisterMasterNodeInput = z.infer<typeof registerMasterNodeInputSchema>;
export type ApplyMasterNodeHeartbeatInput = z.infer<typeof applyMasterNodeHeartbeatInputSchema>;

/* internode types */

export type AuthenticatedMasterNodeCaller = z.infer<typeof authenticatedMasterNodeCallerSchema>;
export type InternodeTaskEntry = z.infer<typeof internodeTaskEntrySchema>;
export type FetchMasterInfoInternodeResult = z.infer<typeof fetchMasterInfoInternodeResultSchema>;
export type RegisterMasterNodeInternodeInput = z.infer<typeof registerMasterNodeInternodeInputSchema>;
export type FetchClusterMembershipSnapshotInternodeInput = z.infer<
  typeof fetchClusterMembershipSnapshotInternodeInputSchema
>;
export type FetchTaskEntriesInternodeInput = z.infer<typeof fetchTaskEntriesInternodeInputSchema>;
export type FetchTaskEntriesInternodeResult = z.infer<typeof fetchTaskEntriesInternodeResultSchema>;
export type FetchTaskPayloadInternodeInput = z.infer<typeof fetchTaskPayloadInternodeInputSchema>;
export type ForwardTaskInternodeInput = z.infer<typeof forwardTaskInternodeInputSchema>;
export type RequestVoteInternodeInput = z.infer<typeof requestVoteInternodeInputSchema>;
export type RecordLeaderHeartbeatInternodeInput = z.infer<typeof recordLeaderHeartbeatInternodeInputSchema>;

/* client types */

export type FetchMasterInfoClientInput = z.infer<typeof fetchMasterInfoClientInputSchema>;
export type RegisterMasterNodeClientInput = z.infer<typeof registerMasterNodeClientInputSchema>;
export type FetchClusterMembershipSnapshotClientInput = z.infer<typeof fetchClusterMembershipSnapshotClientInputSchema>;
export type FetchTaskEntriesClientInput = z.infer<typeof fetchTaskEntriesClientInputSchema>;
export type FetchTaskPayloadClientInput = z.infer<typeof fetchTaskPayloadClientInputSchema>;
export type ForwardTaskClientInput = z.infer<typeof forwardTaskClientInputSchema>;
export type RequestVoteClientInput = z.infer<typeof requestVoteClientInputSchema>;
export type RecordLeaderHeartbeatClientInput = z.infer<typeof recordLeaderHeartbeatClientInputSchema>;

/* cluster synchronization handler types */

export type SynchronizeClusterMembershipInput = z.infer<typeof synchronizeClusterMembershipInputSchema>;

/* task replication handler types */

export type VerifyTaskEntriesFetchResultInput = z.infer<typeof verifyTaskEntriesFetchResultInputSchema>;
export type ReplicateTaskEntriesInput = z.infer<typeof replicateTaskEntriesInputSchema>;
export type ReplicateTaskEntryInput = z.infer<typeof replicateTaskEntryInputSchema>;
export type ReconcileTaskHistoryInput = z.infer<typeof reconcileTaskHistoryInputSchema>;

/* repository types */

export type ApplyMasterNodeRegistrationRepositoryInput = z.infer<
  typeof applyMasterNodeRegistrationRepositoryInputSchema
>;
export type ApplyMasterNodeHeartbeatRepositoryInput = z.infer<
  typeof applyMasterNodeHeartbeatRepositoryInputSchema
>;
export type TransitionMasterNodeModeRepositoryInput = z.infer<typeof transitionMasterNodeModeRepositoryInputSchema>;
