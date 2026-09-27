import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  conflictHttpErrorResponseSchema,
  internalServerErrorHttpErrorResponseSchema,
  unauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import {
  masterNodeCertificateFingerprintSchema,
  masterNodeHostnameSchema,
  masterNodeIdSchema,
  masterNodePortSchema
} from '@/modules/master-nodes/master-node.domain';

import { masterBootstrapRoleSchema } from './bootstrap.domain';

/* schemas */

export const bootstrapFollowerBodySchema = z.object({
  leaderEndpoint: z.object({
    hostname: masterNodeHostnameSchema,
    port: masterNodePortSchema
  }),
  leaderCertificateFingerprint: masterNodeCertificateFingerprintSchema
});

export const bootstrapResultResponseSchema = z.object({
  role: masterBootstrapRoleSchema,
  epoch: z.string().regex(/^\d+$/),
  leaderMasterId: masterNodeIdSchema
});

export const bootstrapLeaderHttpSchema = {
  response: {
    200: bootstrapResultResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema
  }
};

export const bootstrapFollowerHttpSchema = {
  body: bootstrapFollowerBodySchema,
  response: {
    200: bootstrapResultResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema
  }
};

/* types */

export type BootstrapFollowerBody = z.infer<typeof bootstrapFollowerBodySchema>;
export type BootstrapResultResponse = z.infer<typeof bootstrapResultResponseSchema>;

export type BootstrapLeaderHttpRoute = InferHttpRoute<typeof bootstrapLeaderHttpSchema>;
export type BootstrapFollowerHttpRoute = InferHttpRoute<typeof bootstrapFollowerHttpSchema>;
