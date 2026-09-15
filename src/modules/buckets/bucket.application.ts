import { z } from 'zod';

import { userIdSchema } from '@/modules/users/user.domain';

import { bucketIdSchema, bucketNameSchema, bucketSchema, bucketStateSchema } from './bucket.domain';

/* schemas */

export const ensureBucketExistsResultSchema = z.object({
  bucket: bucketSchema,
  status: z.enum(['created', 'existing'])
});

export const createBucketRepositoryInputSchema = z.object({
  id: bucketIdSchema,
  name: bucketNameSchema,

  userId: userIdSchema,

  state: bucketStateSchema,

  revision: z.bigint().nonnegative()
});

/* types */

export type EnsureBucketExistsResult = z.infer<typeof ensureBucketExistsResultSchema>;
export type CreateBucketRepositoryInput = z.infer<typeof createBucketRepositoryInputSchema>;
