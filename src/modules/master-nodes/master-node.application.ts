import { z } from 'zod';

import { consensusLastSequenceSchema } from '@/modules/consensus/consensus.domain';
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

/* internode schemas */

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

export const fetchTaskEntriesInternodeInputSchema = z.object({
  afterSequence: consensusLastSequenceSchema,
  limit: z.number().int().positive()
});

export const fetchTaskEntriesInternodeResultSchema = z.object({
  epoch: taskEpochSchema,
  lastCommittedSequence: consensusLastSequenceSchema,

  entries: z.array(internodeTaskEntrySchema)
});

export const fetchTaskPayloadInternodeInputSchema = z.object({
  payloadId: taskPayloadIdSchema
});

/* client schemas */

export const fetchTaskEntriesClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,

  afterSequence: consensusLastSequenceSchema,
  limit: z.number().int().positive()
});

export const fetchTaskPayloadClientInputSchema = z.object({
  masterNodeEndpoint: masterNodeEndpointSchema,

  payloadId: taskPayloadIdSchema
});

/* repository schemas */

export const applyMasterNodeRegistrationRepositoryInputSchema = registerMasterNodeInputSchema.extend({
  lastContactAt: z.date()
});

/* types */

export type RegisterMasterNodeInput = z.infer<typeof registerMasterNodeInputSchema>;
export type InternodeTaskEntry = z.infer<typeof internodeTaskEntrySchema>;
export type FetchTaskEntriesInternodeInput = z.infer<typeof fetchTaskEntriesInternodeInputSchema>;
export type FetchTaskEntriesInternodeResult = z.infer<typeof fetchTaskEntriesInternodeResultSchema>;
export type FetchTaskPayloadInternodeInput = z.infer<typeof fetchTaskPayloadInternodeInputSchema>;
export type FetchTaskEntriesClientInput = z.infer<typeof fetchTaskEntriesClientInputSchema>;
export type FetchTaskPayloadClientInput = z.infer<typeof fetchTaskPayloadClientInputSchema>;
export type ApplyMasterNodeRegistrationRepositoryInput = z.infer<
  typeof applyMasterNodeRegistrationRepositoryInputSchema
>;
