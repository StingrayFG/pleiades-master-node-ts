import { z } from 'zod';

/* base schemas, types, and definition factory */

export const httpErrorResponsePayloadSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1)
});

export const httpErrorResponseSchema = httpErrorResponsePayloadSchema.extend({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1)
});

export type HttpErrorResponsePayload = z.infer<typeof httpErrorResponsePayloadSchema>;
export type HttpErrorResponse = z.infer<typeof httpErrorResponseSchema>;

const createHttpErrorDefinition = <const TCode extends string, const TStatusCode extends number>(
  code: TCode,
  statusCode: TStatusCode
) => {
  return {
    statusCode,
    code,
    schema: httpErrorResponseSchema.extend({
      statusCode: z.literal(statusCode),
      code: z.literal(code)
    })
  };
};

/* definitions */

export const badRequestHttpErrorDefinition = createHttpErrorDefinition('BAD_REQUEST', 400);
export const unauthorizedHttpErrorDefinition = createHttpErrorDefinition('UNAUTHORIZED', 401);
export const forbiddenHttpErrorDefinition = createHttpErrorDefinition('FORBIDDEN', 403);
export const notFoundHttpErrorDefinition = createHttpErrorDefinition('NOT_FOUND', 404);
export const conflictHttpErrorDefinition = createHttpErrorDefinition('CONFLICT', 409);
export const internalServerErrorHttpErrorDefinition = createHttpErrorDefinition('INTERNAL_SERVER_ERROR', 500);
export const serviceUnavailableHttpErrorDefinition = createHttpErrorDefinition('SERVICE_UNAVAILABLE', 503);
export const gatewayTimeoutHttpErrorDefinition = createHttpErrorDefinition('GATEWAY_TIMEOUT', 504);
export const insufficientStorageHttpErrorDefinition = createHttpErrorDefinition('INSUFFICIENT_STORAGE', 507);

export type KnownHttpErrorDefinition =
  | typeof badRequestHttpErrorDefinition
  | typeof unauthorizedHttpErrorDefinition
  | typeof forbiddenHttpErrorDefinition
  | typeof notFoundHttpErrorDefinition
  | typeof conflictHttpErrorDefinition
  | typeof internalServerErrorHttpErrorDefinition
  | typeof serviceUnavailableHttpErrorDefinition
  | typeof gatewayTimeoutHttpErrorDefinition
  | typeof insufficientStorageHttpErrorDefinition;
export type KnownHttpErrorStatusCode = KnownHttpErrorDefinition['statusCode'];

/* response schemas and types */

export const badRequestHttpErrorResponseSchema = badRequestHttpErrorDefinition.schema;
export const unauthorizedHttpErrorResponseSchema = unauthorizedHttpErrorDefinition.schema;
export const forbiddenHttpErrorResponseSchema = forbiddenHttpErrorDefinition.schema;
export const notFoundHttpErrorResponseSchema = notFoundHttpErrorDefinition.schema;
export const conflictHttpErrorResponseSchema = conflictHttpErrorDefinition.schema;
export const internalServerErrorHttpErrorResponseSchema = internalServerErrorHttpErrorDefinition.schema;
export const serviceUnavailableHttpErrorResponseSchema = serviceUnavailableHttpErrorDefinition.schema;
export const gatewayTimeoutHttpErrorResponseSchema = gatewayTimeoutHttpErrorDefinition.schema;
export const insufficientStorageHttpErrorResponseSchema = insufficientStorageHttpErrorDefinition.schema;

export type BadRequestHttpErrorResponse = z.infer<typeof badRequestHttpErrorDefinition.schema>;
export type UnauthorizedHttpErrorResponse = z.infer<typeof unauthorizedHttpErrorDefinition.schema>;
export type ForbiddenHttpErrorResponse = z.infer<typeof forbiddenHttpErrorDefinition.schema>;
export type NotFoundHttpErrorResponse = z.infer<typeof notFoundHttpErrorDefinition.schema>;
export type ConflictHttpErrorResponse = z.infer<typeof conflictHttpErrorDefinition.schema>;
export type InternalServerErrorHttpErrorResponse = z.infer<typeof internalServerErrorHttpErrorDefinition.schema>;
export type ServiceUnavailableHttpErrorResponse = z.infer<typeof serviceUnavailableHttpErrorDefinition.schema>;
export type GatewayTimeoutHttpErrorResponse = z.infer<typeof gatewayTimeoutHttpErrorDefinition.schema>;
export type InsufficientStorageHttpErrorResponse = z.infer<typeof insufficientStorageHttpErrorDefinition.schema>;
