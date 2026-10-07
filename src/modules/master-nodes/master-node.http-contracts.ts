import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  badRequestHttpErrorResponseSchema,
  conflictHttpErrorResponseSchema,
  internalServerErrorHttpErrorResponseSchema,
  notFoundHttpErrorResponseSchema,
  serviceUnavailableHttpErrorResponseSchema,
  unauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import {
  masterNodeCertificateFingerprintSchema,
  masterNodeHostnameSchema,
  masterNodeIdSchema,
  masterNodeModeSchema,
  masterNodePortSchema,
  masterNodeSchemeSchema,
  masterNodeSessionIdSchema,
  masterNodeStateSchema
} from './master-node.domain';

/* schemas */

export const masterNodeIdParamsSchema = z.object({
  masterNodeId: masterNodeIdSchema
});

export const setMasterNodeModeBodySchema = z.object({
  mode: masterNodeModeSchema
});

export const masterNodeResponseSchema = z.object({
  id: masterNodeIdSchema,

  certificateFingerprint: masterNodeCertificateFingerprintSchema,
  sessionId: masterNodeSessionIdSchema,
  state: masterNodeStateSchema,
  mode: masterNodeModeSchema,

  hostname: masterNodeHostnameSchema,
  port: masterNodePortSchema,
  scheme: masterNodeSchemeSchema,

  registeredAt: z.iso.datetime(),
  lastContactAt: z.iso.datetime(),
  lastHeartbeatAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),

  revision: z.string()
});

export const masterNodesResponseSchema = z.array(masterNodeResponseSchema);

export const listMasterNodesHttpSchema = {
  response: {
    200: masterNodesResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const getMasterNodeHttpSchema = {
  params: masterNodeIdParamsSchema,
  response: {
    200: masterNodeResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const setMasterNodeModeHttpSchema = {
  params: masterNodeIdParamsSchema,
  body: setMasterNodeModeBodySchema,
  response: {
    200: masterNodeResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

/* types */

export type MasterNodeIdParams = z.infer<typeof masterNodeIdParamsSchema>;
export type SetMasterNodeModeBody = z.infer<typeof setMasterNodeModeBodySchema>;
export type MasterNodeResponse = z.infer<typeof masterNodeResponseSchema>;
export type MasterNodesResponse = z.infer<typeof masterNodesResponseSchema>;

export type ListMasterNodesHttpRoute = InferHttpRoute<typeof listMasterNodesHttpSchema>;
export type GetMasterNodeHttpRoute = InferHttpRoute<typeof getMasterNodeHttpSchema>;
export type SetMasterNodeModeHttpRoute = InferHttpRoute<typeof setMasterNodeModeHttpSchema>;
