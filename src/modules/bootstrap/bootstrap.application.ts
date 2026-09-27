import { z } from 'zod';

import { consensusEpochSchema } from '@/modules/consensus/consensus.domain';
import {
  masterNodeCertificateFingerprintSchema,
  masterNodeEndpointSchema,
  masterNodeIdSchema
} from '@/modules/master-nodes/master-node.domain';

import { masterBootstrapRoleSchema } from './bootstrap.domain';

/* schemas */

export const bootstrapAsFollowerInputSchema = z.object({
  leaderEndpoint: masterNodeEndpointSchema,
  leaderCertificateFingerprint: masterNodeCertificateFingerprintSchema
});

export const masterBootstrapResultSchema = z.object({
  role: masterBootstrapRoleSchema,
  epoch: consensusEpochSchema,
  leaderMasterId: masterNodeIdSchema
});

/* types */

export type BootstrapAsFollowerInput = z.infer<typeof bootstrapAsFollowerInputSchema>;
export type MasterBootstrapResult = z.infer<typeof masterBootstrapResultSchema>;
