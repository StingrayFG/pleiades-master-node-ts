import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  badRequestHttpErrorResponseSchema,
  conflictHttpErrorResponseSchema,
  forbiddenHttpErrorResponseSchema,
  internalServerErrorHttpErrorResponseSchema,
  notFoundHttpErrorResponseSchema,
  serviceUnavailableHttpErrorResponseSchema,
  unauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import {
  userApiKeyIdSchema,
  userApiKeyStateSchema,
  userIdSchema,
  userStateSchema,
  userUsernameSchema
} from './user.domain';

/* schemas */

export const userResponseSchema = z.object({
  id: userIdSchema,

  username: userUsernameSchema,

  state: userStateSchema,

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const userApiKeyResponseSchema = z.object({
  id: userApiKeyIdSchema,

  state: userApiKeyStateSchema,

  name: z.string(),

  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable()
});

export const authenticationTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string()
});

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string()
});

export const signupBodySchema = z.object({
  username: userUsernameSchema,
  password: z.string().min(8)
});

export const signupHttpSchema = {
  body: signupBodySchema,
  response: {
    201: userResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const loginBodySchema = z.object({
  username: userUsernameSchema,
  password: z.string()
});

export const loginHttpSchema = {
  body: loginBodySchema,
  response: {
    200: authenticationTokenResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    403: forbiddenHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const refreshAuthenticationHttpSchema = {
  body: refreshTokenBodySchema,
  response: {
    200: authenticationTokenResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    403: forbiddenHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const logoutHttpSchema = {
  body: refreshTokenBodySchema,
  response: {
    204: z.void(),
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const listApiKeysResponseSchema = z.array(userApiKeyResponseSchema);

export const listApiKeysHttpSchema = {
  response: {
    200: listApiKeysResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const createApiKeyBodySchema = z.object({
  name: z.string().min(1).max(128),
  expiresAt: z.coerce.date().nullable()
});

export const createApiKeyResponseSchema = z.object({
  apiKey: userApiKeyResponseSchema,
  token: z.string()
});

export const createApiKeyHttpSchema = {
  body: createApiKeyBodySchema,
  response: {
    201: createApiKeyResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const revokeApiKeyParamsSchema = z.object({
  apiKeyId: userApiKeyIdSchema
});

export const revokeApiKeyHttpSchema = {
  params: revokeApiKeyParamsSchema,
  response: {
    200: userApiKeyResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

/* types */

export type UserResponse = z.infer<typeof userResponseSchema>;
export type UserApiKeyResponse = z.infer<typeof userApiKeyResponseSchema>;
export type AuthenticationTokenResponse = z.infer<typeof authenticationTokenResponseSchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenBodySchema>;

export type SignupBody = z.infer<typeof signupBodySchema>;
export type SignupHttpRoute = InferHttpRoute<typeof signupHttpSchema>;

export type LoginBody = z.infer<typeof loginBodySchema>;
export type LoginHttpRoute = InferHttpRoute<typeof loginHttpSchema>;

export type RefreshAuthenticationHttpRoute = InferHttpRoute<typeof refreshAuthenticationHttpSchema>;

export type LogoutHttpRoute = InferHttpRoute<typeof logoutHttpSchema>;

export type ListApiKeysResponse = z.infer<typeof listApiKeysResponseSchema>;
export type ListApiKeysHttpRoute = InferHttpRoute<typeof listApiKeysHttpSchema>;

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
export type CreateApiKeyHttpRoute = InferHttpRoute<typeof createApiKeyHttpSchema>;

export type RevokeApiKeyParams = z.infer<typeof revokeApiKeyParamsSchema>;
export type RevokeApiKeyHttpRoute = InferHttpRoute<typeof revokeApiKeyHttpSchema>;
