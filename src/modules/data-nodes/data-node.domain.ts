import { z } from 'zod';

/* field schemas */

export const DATA_NODE_STATES = ['joining', 'active', 'offline', 'failed'] as const;
export const DATA_NODE_MODES = ['serving', 'draining'] as const;
export const DATA_NODE_SCHEMES = ['grpcs'] as const;
export const DATA_NODE_HEALTH_SNAPSHOT_STATUS = ['healthy', 'degraded'] as const;

export const dataNodeIdSchema = z.string().min(1);

export const dataNodeCertificateFingerprintSchema = z.string().min(1);
export const dataNodeSessionIdSchema = z.string().uuid();
export const dataNodeStateSchema = z.enum(DATA_NODE_STATES);
export const dataNodeModeSchema = z.enum(DATA_NODE_MODES);

export const dataNodeHostnameSchema = z.string().min(1);
export const dataNodePortSchema = z.number().int().min(1).max(65535);
export const dataNodeSchemeSchema = z.enum(DATA_NODE_SCHEMES);

export const dataNodeHealthSnapshotStatusSchema = z.enum(DATA_NODE_HEALTH_SNAPSHOT_STATUS);

/* object schemas */

export const dataNodeEndpointSchema = z.object({
  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema
});

export const dataNodeSchema = z.object({
  id: dataNodeIdSchema,

  certificateFingerprint: dataNodeCertificateFingerprintSchema,
  sessionId: dataNodeSessionIdSchema,
  state: dataNodeStateSchema,
  mode: dataNodeModeSchema,

  hostname: dataNodeHostnameSchema,
  port: dataNodePortSchema,
  scheme: dataNodeSchemeSchema,

  storageTotalBytes: z.bigint().nonnegative(),
  storageFreeBytes: z.bigint().nonnegative(),

  registeredAt: z.date(),
  lastContactAt: z.date(),
  lastHealthCheckAt: z.date().nullable(),
  lastHeartbeatAt: z.date().nullable(),
  updatedAt: z.date(),

  revision: z.bigint().nonnegative()
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

/* types */

export type DataNodeId = z.infer<typeof dataNodeIdSchema>;

export type DataNodeCertificateFingerprint = z.infer<typeof dataNodeCertificateFingerprintSchema>;
export type DataNodeSessionId = z.infer<typeof dataNodeSessionIdSchema>;
export type DataNodeState = z.infer<typeof dataNodeStateSchema>;
export type DataNodeMode = z.infer<typeof dataNodeModeSchema>;

export type DataNodeHostname = z.infer<typeof dataNodeHostnameSchema>;
export type DataNodePort = z.infer<typeof dataNodePortSchema>;
export type DataNodeScheme = z.infer<typeof dataNodeSchemeSchema>;

export type DataNodeHealthSnapshotStatus = z.infer<typeof dataNodeHealthSnapshotStatusSchema>;

export type DataNodeEndpoint = z.infer<typeof dataNodeEndpointSchema>;
export type DataNode = z.infer<typeof dataNodeSchema>;
export type DataNodeHealthSnapshot = z.infer<typeof dataNodeHealthSnapshotSchema>;
