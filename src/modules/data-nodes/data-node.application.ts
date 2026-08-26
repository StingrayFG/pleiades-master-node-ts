import { z } from 'zod';

import {
  dataNodeHealthSnapshotSchema,
  dataNodeHostnameSchema,
  dataNodeIdSchema,
  dataNodePortSchema,
  dataNodeSchemeSchema,
  dataNodeStateSchema
} from './data-node.domain';

/* schemas */

export const registerDataNodeInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema,
  healthSnapshot: dataNodeHealthSnapshotSchema
});

export const upsertDataNodeRepositoryInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema,
  state: dataNodeStateSchema,
  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),
  lastHeartbeatAt: z.date()
});

export const heartbeatDataNodeInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  healthSnapshot: dataNodeHealthSnapshotSchema
});

export const applyHeartbeatRepositoryInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  state: dataNodeStateSchema,
  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),
  lastHeartbeatAt: z.date()
});

/* types */

export type RegisterDataNodeInput = z.infer<typeof registerDataNodeInputSchema>;
export type UpsertDataNodeRepositoryInput = z.infer<typeof upsertDataNodeRepositoryInputSchema>;
export type HeartbeatDataNodeInput = z.infer<typeof heartbeatDataNodeInputSchema>;
export type ApplyHeartbeatRepositoryInput = z.infer<typeof applyHeartbeatRepositoryInputSchema>;
