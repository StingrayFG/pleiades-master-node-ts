import { z } from 'zod';

export const HttpErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1)
});

export type HttpErrorResponse = z.infer<typeof HttpErrorResponseSchema>;
export type HttpErrorResponsePayload = Omit<HttpErrorResponse, 'requestId'>;

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

/**/

export const badRequestHttpErrorDefinition = createHttpErrorDefinition('BAD_REQUEST', 400);
export const unauthorizedHttpErrorDefinition = createHttpErrorDefinition('UNAUTHORIZED', 401);
export const forbiddenHttpErrorDefinition = createHttpErrorDefinition('FORBIDDEN', 403);
export const notFoundHttpErrorDefinition = createHttpErrorDefinition('NOT_FOUND', 404);
export const conflictHttpErrorDefinition = createHttpErrorDefinition('CONFLICT', 409);
export const internalServerErrorHttpErrorDefinition = createHttpErrorDefinition('INTERNAL_SERVER_ERROR', 500);

export const BadRequestHttpErrorResponseSchema = badRequestHttpErrorDefinition.schema;
export const UnauthorizedHttpErrorResponseSchema = unauthorizedHttpErrorDefinition.schema;
export const ForbiddenHttpErrorResponseSchema = forbiddenHttpErrorDefinition.schema;
export const NotFoundHttpErrorResponseSchema = notFoundHttpErrorDefinition.schema;
export const ConflictHttpErrorResponseSchema = conflictHttpErrorDefinition.schema;
export const InternalServerErrorHttpErrorResponseSchema = internalServerErrorHttpErrorDefinition.schema;

export type BadRequestHttpErrorResponse = z.infer<typeof badRequestHttpErrorDefinition.schema>;
export type UnauthorizedHttpErrorResponse = z.infer<typeof unauthorizedHttpErrorDefinition>;
export type ForbiddenHttpErrorResponse = z.infer<typeof forbiddenHttpErrorDefinition>;
export type NotFoundHttpErrorResponse = z.infer<typeof notFoundHttpErrorDefinition>;
export type ConflictHttpErrorResponse = z.infer<typeof conflictHttpErrorDefinition>;
export type InternalServerErrorHttpErrorResponse = z.infer<typeof internalServerErrorHttpErrorDefinition>;

/**/

export type KnownHttpErrorDefinition =
  | typeof badRequestHttpErrorDefinition
  | typeof unauthorizedHttpErrorDefinition
  | typeof forbiddenHttpErrorDefinition
  | typeof notFoundHttpErrorDefinition
  | typeof conflictHttpErrorDefinition
  | typeof internalServerErrorHttpErrorDefinition;
export type KnownHttpErrorStatusCode = KnownHttpErrorDefinition['statusCode'];
