import { z } from 'zod';

/* base schemas, types, and definition factory */

export const HttpErrorResponsePayloadSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1)
});

export const HttpErrorResponseSchema = HttpErrorResponsePayloadSchema.extend({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1)
});

export type HttpErrorResponsePayload = z.infer<typeof HttpErrorResponsePayloadSchema>;
export type HttpErrorResponse = z.infer<typeof HttpErrorResponseSchema>;

const createHttpErrorDefinition = <const TCode extends string, const TStatusCode extends number>(
  code: TCode,
  statusCode: TStatusCode
) => {
  return {
    statusCode,
    code,
    schema: HttpErrorResponseSchema.extend({
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
export const preconditionFailedHttpErrorDefinition = createHttpErrorDefinition('PRECONDITION_FAILED', 412);
export const tooManyRequestsHttpErrorDefinition = createHttpErrorDefinition('TOO_MANY_REQUESTS', 429);
export const internalServerErrorHttpErrorDefinition = createHttpErrorDefinition('INTERNAL_SERVER_ERROR', 500);
export const serviceUnavailableHttpErrorDefinition = createHttpErrorDefinition('SERVICE_UNAVAILABLE', 503);
export const gatewayTimeoutHttpErrorDefinition = createHttpErrorDefinition('GATEWAY_TIMEOUT', 504);

export type KnownHttpErrorDefinition =
  | typeof badRequestHttpErrorDefinition
  | typeof unauthorizedHttpErrorDefinition
  | typeof forbiddenHttpErrorDefinition
  | typeof notFoundHttpErrorDefinition
  | typeof conflictHttpErrorDefinition
  | typeof preconditionFailedHttpErrorDefinition
  | typeof tooManyRequestsHttpErrorDefinition
  | typeof internalServerErrorHttpErrorDefinition
  | typeof serviceUnavailableHttpErrorDefinition
  | typeof gatewayTimeoutHttpErrorDefinition;
export type KnownHttpErrorStatusCode = KnownHttpErrorDefinition['statusCode'];

/* response schemas and types */

export const BadRequestHttpErrorResponseSchema = badRequestHttpErrorDefinition.schema;
export const UnauthorizedHttpErrorResponseSchema = unauthorizedHttpErrorDefinition.schema;
export const ForbiddenHttpErrorResponseSchema = forbiddenHttpErrorDefinition.schema;
export const NotFoundHttpErrorResponseSchema = notFoundHttpErrorDefinition.schema;
export const ConflictHttpErrorResponseSchema = conflictHttpErrorDefinition.schema;
export const PreconditionFailedHttpErrorResponseSchema = preconditionFailedHttpErrorDefinition.schema;
export const TooManyRequestsHttpErrorResponseSchema = tooManyRequestsHttpErrorDefinition.schema;
export const InternalServerErrorHttpErrorResponseSchema = internalServerErrorHttpErrorDefinition.schema;
export const ServiceUnavailableHttpErrorResponseSchema = serviceUnavailableHttpErrorDefinition.schema;
export const GatewayTimeoutHttpErrorResponseSchema = gatewayTimeoutHttpErrorDefinition.schema;

export type BadRequestHttpErrorResponse = z.infer<typeof badRequestHttpErrorDefinition.schema>;
export type UnauthorizedHttpErrorResponse = z.infer<typeof unauthorizedHttpErrorDefinition.schema>;
export type ForbiddenHttpErrorResponse = z.infer<typeof forbiddenHttpErrorDefinition.schema>;
export type NotFoundHttpErrorResponse = z.infer<typeof notFoundHttpErrorDefinition.schema>;
export type ConflictHttpErrorResponse = z.infer<typeof conflictHttpErrorDefinition.schema>;
export type PreconditionFailedHttpErrorResponse = z.infer<typeof preconditionFailedHttpErrorDefinition.schema>;
export type TooManyRequestsHttpErrorResponse = z.infer<typeof tooManyRequestsHttpErrorDefinition.schema>;
export type InternalServerErrorHttpErrorResponse = z.infer<typeof internalServerErrorHttpErrorDefinition.schema>;
export type ServiceUnavailableHttpErrorResponse = z.infer<typeof serviceUnavailableHttpErrorDefinition.schema>;
export type GatewayTimeoutHttpErrorResponse = z.infer<typeof gatewayTimeoutHttpErrorDefinition.schema>;
