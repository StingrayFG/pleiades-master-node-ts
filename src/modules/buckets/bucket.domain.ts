import { z } from 'zod';

export const BUCKET_STATES = ['active', 'deleting', 'disabled'] as const;

export const bucketIdSchema = z.uuid();
export type BucketId = z.infer<typeof bucketIdSchema>;

export const bucketNameSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/);
export type BucketName = z.infer<typeof bucketNameSchema>;

export const bucketStateSchema = z.enum(BUCKET_STATES);
export type BucketState = z.infer<typeof bucketStateSchema>;

export const bucketSchema = z.object({
  id: bucketIdSchema,
  name: bucketNameSchema,
  state: bucketStateSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Bucket = z.infer<typeof bucketSchema>;
