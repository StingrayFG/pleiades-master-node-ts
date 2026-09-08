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

import { bucketNameSchema, bucketStateSchema } from './bucket.domain';

/* schemas */

export const bucketNameParamsSchema = z.object({
  bucketName: bucketNameSchema
});

export const bucketResponseSchema = z.object({
  name: bucketNameSchema,

  state: bucketStateSchema,

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const bucketsResponseSchema = z.array(bucketResponseSchema);

export const listBucketsHttpSchema = {
  response: {
    200: bucketsResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const getBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const putBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    201: bucketResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    409: conflictHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

export const deleteBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    400: badRequestHttpErrorResponseSchema,
    401: unauthorizedHttpErrorResponseSchema,
    404: notFoundHttpErrorResponseSchema,
    500: internalServerErrorHttpErrorResponseSchema,
    503: serviceUnavailableHttpErrorResponseSchema
  }
};

/* types */

export type BucketNameParams = z.infer<typeof bucketNameParamsSchema>;
export type BucketResponse = z.infer<typeof bucketResponseSchema>;
export type BucketsResponse = z.infer<typeof bucketsResponseSchema>;

export type ListBucketsHttpRoute = InferHttpRoute<typeof listBucketsHttpSchema>;
export type GetBucketHttpRoute = InferHttpRoute<typeof getBucketHttpSchema>;
export type PutBucketHttpRoute = InferHttpRoute<typeof putBucketHttpSchema>;
export type DeleteBucketHttpRoute = InferHttpRoute<typeof deleteBucketHttpSchema>;
