import { Readable } from 'node:stream';
import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  badRequestHttpErrorResponseSchema,
  conflictHttpErrorResponseSchema,
  gatewayTimeoutHttpErrorResponseSchema,
  insufficientStorageHttpErrorResponseSchema,
  internalServerErrorHttpErrorResponseSchema,
  notFoundHttpErrorResponseSchema,
  serviceUnavailableHttpErrorResponseSchema,
  unauthorizedHttpErrorResponseSchema
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
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const headObjectHttpSchema = {
  params: objectParamsSchema,
  response: {
    200: emptyResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
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
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema,
    504: gatewayTimeoutHttpErrorResponseSchema,
    507: insufficientStorageHttpErrorResponseSchema
  }
};

/* types */

export type ObjectParams = z.infer<typeof objectParamsSchema>;
export type GetObjectHttpRoute = InferHttpRoute<typeof getObjectHttpSchema>;
export type HeadObjectHttpRoute = InferHttpRoute<typeof headObjectHttpSchema>;
export type PutObjectHeaders = z.infer<typeof putObjectHeadersSchema>;
export type PutObjectHttpRoute = InferHttpRoute<typeof putObjectHttpSchema>;
