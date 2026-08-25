import { z } from 'zod';

import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';
import {
  BadRequestHttpErrorResponseSchema,
  InternalServerErrorHttpErrorResponseSchema,
  NotFoundHttpErrorResponseSchema,
  UnauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import { bucketNameSchema, bucketStateSchema } from './bucket.domain';

export const bucketNameParamsSchema = z.object({
  bucketName: bucketNameSchema
});
export type BucketNameParams = z.infer<typeof bucketNameParamsSchema>;

export const bucketResponseSchema = z.object({
  name: bucketNameSchema,
  state: bucketStateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type BucketResponse = z.infer<typeof bucketResponseSchema>;

export const bucketsResponseSchema = z.array(bucketResponseSchema);
export type BucketsResponse = z.infer<typeof bucketsResponseSchema>;

export const listBucketsHttpSchema = {
  response: {
    200: bucketsResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema
  }
};
export type ListBucketsHttpRoute = InferHttpRoute<typeof listBucketsHttpSchema>;

export const getBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    404: NotFoundHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema
  }
};
export type GetBucketHttpRoute = InferHttpRoute<typeof getBucketHttpSchema>;

export const putBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    201: bucketResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema
  }
};
export type PutBucketHttpRoute = InferHttpRoute<typeof putBucketHttpSchema>;

export const deleteBucketHttpSchema = {
  params: bucketNameParamsSchema,
  response: {
    200: bucketResponseSchema,
    400: BadRequestHttpErrorResponseSchema,
    401: UnauthorizedHttpErrorResponseSchema,
    404: NotFoundHttpErrorResponseSchema,
    500: InternalServerErrorHttpErrorResponseSchema
  }
};
export type DeleteBucketHttpRoute = InferHttpRoute<typeof deleteBucketHttpSchema>;
