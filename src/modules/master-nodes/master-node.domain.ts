import { z } from 'zod';

import { nodeIdSchema, nodeSessionIdSchema } from '@/modules/identity/identity.domain';

/* constants */

export const MASTER_NODE_STATES = ['joining', 'active', 'offline', 'failed'] as const;
export const MASTER_NODE_MODES = ['serving', 'draining'] as const;
export const MASTER_NODE_SCHEMES = ['grpcs'] as const;

/* field schemas */

export const masterNodeIdSchema = nodeIdSchema;

export const masterNodeCertificateFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const masterNodeSessionIdSchema = nodeSessionIdSchema;
export const masterNodeStateSchema = z.enum(MASTER_NODE_STATES);
export const masterNodeModeSchema = z.enum(MASTER_NODE_MODES);

export const masterNodeHostnameSchema = z.string().min(1);
export const masterNodePortSchema = z.number().int().min(1).max(65535);
export const masterNodeSchemeSchema = z.enum(MASTER_NODE_SCHEMES);

/* object schemas */

export const masterNodeEndpointSchema = z.object({
  hostname: masterNodeHostnameSchema,
  port: masterNodePortSchema,
  scheme: masterNodeSchemeSchema
});

export const masterNodeSchema = z.object({
  id: masterNodeIdSchema,

  certificateFingerprint: masterNodeCertificateFingerprintSchema,
  sessionId: masterNodeSessionIdSchema,
  state: masterNodeStateSchema,
  mode: masterNodeModeSchema,

  hostname: masterNodeHostnameSchema,
  port: masterNodePortSchema,
  scheme: masterNodeSchemeSchema,

  registeredAt: z.date(),
  lastContactAt: z.date(),
  lastHeartbeatAt: z.date().nullable(),
  updatedAt: z.date(),

  revision: z.bigint().nonnegative()
});

/* field types */

export type MasterNodeId = z.infer<typeof masterNodeIdSchema>;

export type MasterNodeCertificateFingerprint = z.infer<typeof masterNodeCertificateFingerprintSchema>;
export type MasterNodeSessionId = z.infer<typeof masterNodeSessionIdSchema>;
export type MasterNodeState = z.infer<typeof masterNodeStateSchema>;
export type MasterNodeMode = z.infer<typeof masterNodeModeSchema>;

export type MasterNodeHostname = z.infer<typeof masterNodeHostnameSchema>;
export type MasterNodePort = z.infer<typeof masterNodePortSchema>;
export type MasterNodeScheme = z.infer<typeof masterNodeSchemeSchema>;

/* object types */

export type MasterNodeEndpoint = z.infer<typeof masterNodeEndpointSchema>;
export type MasterNode = z.infer<typeof masterNodeSchema>;
