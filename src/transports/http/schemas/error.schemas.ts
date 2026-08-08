import { z } from 'zod';

const HttpErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1)
});

type HttpErrorResponse = z.infer<typeof HttpErrorResponseSchema>;
type HttpErrorResponsePayload = Omit<HttpErrorResponse, 'requestId'>;

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
  } as const;
};

const badRequestHttpErrorDefinition = createHttpErrorDefinition('BAD_REQUEST', 400);
const unauthorizedHttpErrorDefinition = createHttpErrorDefinition('UNAUTHORIZED', 401);
const forbiddenHttpErrorDefinition = createHttpErrorDefinition('FORBIDDEN', 403);
const notFoundHttpErrorDefinition = createHttpErrorDefinition('NOT_FOUND', 404);
const conflictHttpErrorDefinition = createHttpErrorDefinition('CONFLICT', 409);
const internalServerErrorHttpErrorDefinition = createHttpErrorDefinition('INTERNAL_SERVER_ERROR', 500);

const BadRequestHttpErrorResponseSchema = badRequestHttpErrorDefinition.schema;
const UnauthorizedHttpErrorResponseSchema = unauthorizedHttpErrorDefinition.schema;
const ForbiddenHttpErrorResponseSchema = forbiddenHttpErrorDefinition.schema;
const NotFoundHttpErrorResponseSchema = notFoundHttpErrorDefinition.schema;
const ConflictHttpErrorResponseSchema = conflictHttpErrorDefinition.schema;
const InternalServerErrorHttpErrorResponseSchema = internalServerErrorHttpErrorDefinition.schema;

type BadRequestHttpErrorResponse = z.infer<typeof badRequestHttpErrorDefinition.schema>;
type UnauthorizedHttpErrorResponse = z.infer<typeof unauthorizedHttpErrorDefinition>;
type ForbiddenHttpErrorResponse = z.infer<typeof forbiddenHttpErrorDefinition>;
type NotFoundHttpErrorResponse = z.infer<typeof notFoundHttpErrorDefinition>;
type ConflictHttpErrorResponse = z.infer<typeof conflictHttpErrorDefinition>;
type InternalServerErrorHttpErrorResponse = z.infer<typeof internalServerErrorHttpErrorDefinition>;

type KnownHttpErrorDefinition =
  | typeof badRequestHttpErrorDefinition
  | typeof unauthorizedHttpErrorDefinition
  | typeof forbiddenHttpErrorDefinition
  | typeof notFoundHttpErrorDefinition
  | typeof conflictHttpErrorDefinition
  | typeof internalServerErrorHttpErrorDefinition;
type KnownHttpErrorStatusCode = KnownHttpErrorDefinition['statusCode'];

export {
  HttpErrorResponseSchema,
  badRequestHttpErrorDefinition,
  unauthorizedHttpErrorDefinition,
  forbiddenHttpErrorDefinition,
  notFoundHttpErrorDefinition,
  conflictHttpErrorDefinition,
  internalServerErrorHttpErrorDefinition,
  BadRequestHttpErrorResponseSchema,
  UnauthorizedHttpErrorResponseSchema,
  ForbiddenHttpErrorResponseSchema,
  NotFoundHttpErrorResponseSchema,
  ConflictHttpErrorResponseSchema,
  InternalServerErrorHttpErrorResponseSchema
};

export type {
  HttpErrorResponse,
  HttpErrorResponsePayload,
  BadRequestHttpErrorResponse,
  UnauthorizedHttpErrorResponse,
  ForbiddenHttpErrorResponse,
  NotFoundHttpErrorResponse,
  ConflictHttpErrorResponse,
  InternalServerErrorHttpErrorResponse,
  KnownHttpErrorDefinition,
  KnownHttpErrorStatusCode
};
