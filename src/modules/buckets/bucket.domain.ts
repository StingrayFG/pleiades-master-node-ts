import { z } from 'zod';

import { userIdSchema } from '@/modules/users/user.domain';

/* field schemas */

export const BUCKET_STATES = ['active', 'deleting', 'disabled'] as const;

export const bucketIdSchema = z.uuid();
export const bucketNameSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/);
export const bucketStateSchema = z.enum(BUCKET_STATES);

/* object schemas */

export const bucketSchema = z.object({
  id: bucketIdSchema,
  name: bucketNameSchema,

  userId: userIdSchema,

  state: bucketStateSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

/* types */

export type BucketId = z.infer<typeof bucketIdSchema>;
export type BucketName = z.infer<typeof bucketNameSchema>;
export type BucketState = z.infer<typeof bucketStateSchema>;

export type Bucket = z.infer<typeof bucketSchema>;
