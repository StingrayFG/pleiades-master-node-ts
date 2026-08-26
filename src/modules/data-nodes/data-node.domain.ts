import { z } from 'zod';

/* field schemas */

export const DATA_NODE_STATES = ['joining', 'active', 'draining', 'offline', 'failed'] as const;
export const DATA_NODE_SCHEMES = ['grpc', 'grpcs'] as const;

export const dataNodeIdSchema = z.string().min(1);
export const dataNodeHostnameSchema = z.string().min(1);
export const dataNodePortSchema = z.number().int().min(1).max(65535);
export const dataNodeStateSchema = z.enum(DATA_NODE_STATES);
export const dataNodeSchemeSchema = z.enum(DATA_NODE_SCHEMES);

export const DATA_NODE_HEALTH_SNAPSHOT_STATUS = ['healthy', 'degraded'] as const;
export const dataNodeHealthSnapshotStatusSchema = z.enum(DATA_NODE_HEALTH_SNAPSHOT_STATUS);

/* object schemas */

export const dataNodeEndpointSchema = z.object({
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema
});

export const dataNodeSchema = z.object({
  nodeId: dataNodeIdSchema,
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema,
  state: dataNodeStateSchema,
  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),
  lastHeartbeatAt: z.date().nullable(),
  registeredAt: z.date(),
  updatedAt: z.date()
});

export const dataNodeHealthSnapshotSchema = z
  .object({
    status: dataNodeHealthSnapshotStatusSchema,
    databaseOk: z.boolean(),
    storageOk: z.boolean(),
    storageTotalBytes: z.bigint().nonnegative(),
    storageFreeBytes: z.bigint().nonnegative(),
    message: z.string()
  })
  .refine((value) => value.storageFreeBytes <= value.storageTotalBytes, {
    message: 'Free bytes exceed total bytes',
    path: ['storageFreeBytes']
  });

/* policies */

export const resolveDataNodeState = (healthSnapshot: DataNodeHealthSnapshot): DataNodeState => {
  if (!healthSnapshot.databaseOk || !healthSnapshot.storageOk) {
    return 'failed';
  }
  if (healthSnapshot.status === 'healthy') {
    return 'active';
  }
  if (healthSnapshot.status === 'degraded') {
    return 'failed';
  }
  return 'failed';
};

/* types */

export type DataNodeId = z.infer<typeof dataNodeIdSchema>;
export type DataNodeHostname = z.infer<typeof dataNodeHostnameSchema>;
export type DataNodePort = z.infer<typeof dataNodePortSchema>;
export type DataNodeState = z.infer<typeof dataNodeStateSchema>;
export type DataNodeScheme = z.infer<typeof dataNodeSchemeSchema>;
export type DataNodeHealthSnapshotStatus = z.infer<typeof dataNodeHealthSnapshotStatusSchema>;

export type DataNodeEndpoint = z.infer<typeof dataNodeEndpointSchema>;
export type DataNode = z.infer<typeof dataNodeSchema>;
export type DataNodeHealthSnapshot = z.infer<typeof dataNodeHealthSnapshotSchema>;
