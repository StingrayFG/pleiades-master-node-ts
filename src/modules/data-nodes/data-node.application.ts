import { z } from 'zod';

import {
  dataNodeEndpointSchema,
  dataNodeHealthSnapshotSchema,
  dataNodeIdSchema,
  dataNodeSessionIdSchema,
  dataNodeStateSchema
} from './data-node.domain';

/* service schemas */

export const registerDataNodeInputSchema = z.object({
  id: dataNodeIdSchema,
  endpoint: dataNodeEndpointSchema,

  healthSnapshot: dataNodeHealthSnapshotSchema
});

export const heartbeatDataNodeInputSchema = z.object({
  id: dataNodeIdSchema,

  sessionId: dataNodeSessionIdSchema,
  heartbeatSequence: z.bigint().positive(),

  healthSnapshot: dataNodeHealthSnapshotSchema
});

/* repository schemas */

export const applyDataNodeRegistrationRepositoryInputSchema = z.object({
  id: dataNodeIdSchema,

  sessionId: dataNodeSessionIdSchema,
  state: dataNodeStateSchema,

  endpoint: dataNodeEndpointSchema,

  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),

  lastContactAt: z.date(),

  expectedRevision: z.bigint().nonnegative().nullable()
});

export const applyHeartbeatRepositoryInputSchema = z.object({
  id: dataNodeIdSchema,

  sessionId: dataNodeSessionIdSchema,
  heartbeatSequence: z.bigint().positive(),
  state: dataNodeStateSchema,

  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),

  lastContactAt: z.date(),
  lastHeartbeatAt: z.date()
});

export const recordDataNodeHealthCheckRepositoryInputSchema = z.object({
  id: dataNodeIdSchema,

  lastHealthCheckAt: z.date(),

  expectedRevision: z.bigint().nonnegative()
});

export const updateDataNodeStateRepositoryInputSchema = z.object({
  id: dataNodeIdSchema,

  state: dataNodeStateSchema,

  expectedRevision: z.bigint().nonnegative()
});

/* types */

export type RegisterDataNodeInput = z.infer<typeof registerDataNodeInputSchema>;
export type HeartbeatDataNodeInput = z.infer<typeof heartbeatDataNodeInputSchema>;

export type ApplyDataNodeRegistrationRepositoryInput = z.infer<typeof applyDataNodeRegistrationRepositoryInputSchema>;
export type ApplyHeartbeatRepositoryInput = z.infer<typeof applyHeartbeatRepositoryInputSchema>;
export type RecordDataNodeHealthCheckRepositoryInput = z.infer<typeof recordDataNodeHealthCheckRepositoryInputSchema>;
export type UpdateDataNodeStateRepositoryInput = z.infer<typeof updateDataNodeStateRepositoryInputSchema>;
