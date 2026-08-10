import { z } from 'zod';

import {
  BadRequestHttpErrorResponseSchema,
  InternalServerErrorHttpErrorResponseSchema,
  NotFoundHttpErrorResponseSchema,
  UnauthorizedHttpErrorResponseSchema
} from '@/transports/http/schemas/error.schemas';

import { bucketNameSchema, bucketStateSchema } from './bucket.domain';
import type { InferHttpRoute } from '@/transports/http/contracts/infer-http-route';

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
