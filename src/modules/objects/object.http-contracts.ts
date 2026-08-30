import { Readable } from 'node:stream';
import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  BadRequestHttpErrorResponseSchema,
  ConflictHttpErrorResponseSchema,
  GatewayTimeoutHttpErrorResponseSchema,
  InsufficientStorageHttpErrorResponseSchema,
  InternalServerErrorHttpErrorResponseSchema,
  NotFoundHttpErrorResponseSchema,
  ServiceUnavailableHttpErrorResponseSchema,
  UnauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import { bucketNameSchema } from '@/modules/buckets/bucket.domain';

import { objectKeySchema, objectVersionContentTypeSchema, objectVersionTotalSizeBytesSchema } from './object.domain';

/* schemas */

export const objectParamsSchema = z.object({
  bucketName: bucketNameSchema,
  '*': objectKeySchema
});

export const emptyResponseSchema = z.undefined();

export const objectDataResponseSchema = z.instanceof(Readable);

export const getObjectHttpSchema = {
  params: objectParamsSchema,
  response: {
    200: objectDataResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    404: NotFoundHttpErrorResponseSchema,
    409: ConflictHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema,
    503: ServiceUnavailableHttpErrorResponseSchema
  }
};

export const headObjectHttpSchema = {
  params: objectParamsSchema,
  response: {
    200: emptyResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    404: NotFoundHttpErrorResponseSchema,
    409: ConflictHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema,
    503: ServiceUnavailableHttpErrorResponseSchema
  }
};

export const putObjectHeadersSchema = z.object({
  'content-length': z
    .string()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value))
    .pipe(objectVersionTotalSizeBytesSchema),
  'content-type': objectVersionContentTypeSchema
});

export const putObjectHttpSchema = {
  params: objectParamsSchema,
  headers: putObjectHeadersSchema,
  response: {
    204: emptyResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    404: NotFoundHttpErrorResponseSchema,
    409: ConflictHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema,
    503: ServiceUnavailableHttpErrorResponseSchema,
    504: GatewayTimeoutHttpErrorResponseSchema,
    507: InsufficientStorageHttpErrorResponseSchema
  }
};

/* types */

export type ObjectParams = z.infer<typeof objectParamsSchema>;
export type GetObjectHttpRoute = InferHttpRoute<typeof getObjectHttpSchema>;
export type HeadObjectHttpRoute = InferHttpRoute<typeof headObjectHttpSchema>;
export type PutObjectHeaders = z.infer<typeof putObjectHeadersSchema>;
export type PutObjectHttpRoute = InferHttpRoute<typeof putObjectHttpSchema>;
