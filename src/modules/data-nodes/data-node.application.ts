import { z } from 'zod';

import {
  dataNodeHealthSnapshotSchema,
  dataNodeHostnameSchema,
  dataNodeIdSchema,
  dataNodePortSchema,
  dataNodeSchemeSchema,
  dataNodeStateSchema
} from './data-node.domain';

export const registerDataNodeInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema,
  healthSnapshot: dataNodeHealthSnapshotSchema
});
export type RegisterDataNodeInput = z.infer<typeof registerDataNodeInputSchema>;

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
export type UpsertDataNodeRepositoryInput = z.infer<typeof upsertDataNodeRepositoryInputSchema>;

export const heartbeatDataNodeInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  healthSnapshot: dataNodeHealthSnapshotSchema
});
export type HeartbeatDataNodeInput = z.infer<typeof heartbeatDataNodeInputSchema>;

export const applyHeartbeatRepositoryInputSchema = z.object({
  nodeId: dataNodeIdSchema,
  state: dataNodeStateSchema,
  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),
  lastHeartbeatAt: z.date()
});
export type ApplyHeartbeatRepositoryInput = z.infer<typeof applyHeartbeatRepositoryInputSchema>;

export const checkHealthDataNodeInputSchema = z.object({
  hostname: dataNodeHostnameSchema,
  scheme: dataNodeSchemeSchema,
  port: dataNodePortSchema
});
export type CheckHealthDataNodeClientInput = z.infer<typeof checkHealthDataNodeInputSchema>;
