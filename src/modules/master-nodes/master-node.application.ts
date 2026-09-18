import { z } from 'zod';

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

/* repository schemas */

export const applyMasterNodeRegistrationRepositoryInputSchema = registerMasterNodeInputSchema.extend({
  lastContactAt: z.date()
});

/* types */

export type RegisterMasterNodeInput = z.infer<typeof registerMasterNodeInputSchema>;
export type ApplyMasterNodeRegistrationRepositoryInput = z.infer<
  typeof applyMasterNodeRegistrationRepositoryInputSchema
>;
