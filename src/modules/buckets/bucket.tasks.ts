import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { createTaskDefinition } from '@/modules/tasks/task.definition';
import { userIdSchema } from '@/modules/users/user.domain';

import { bucketIdSchema, bucketNameSchema, type Bucket } from './bucket.domain';

/* data schemas */

export const createBucketTaskDataSchema = z.object({
  bucketId: bucketIdSchema,
  bucketName: bucketNameSchema,

  userId: userIdSchema,

  state: z.literal('active'),

  revision: jsonBigIntCodec
});

export const deleteBucketTaskDataSchema = z.object({
  bucketId: bucketIdSchema,
  bucketName: bucketNameSchema,

  userId: userIdSchema
});

/* definitions */

export const createBucketTaskDefinition = createTaskDefinition<CreateBucketTaskData, Bucket>({
  type: 'bucket.create',
  executionScope: 'cluster',
  dataSchema: createBucketTaskDataSchema
});

export const deleteBucketTaskDefinition = createTaskDefinition<DeleteBucketTaskData, Bucket | null>({
  type: 'bucket.delete',
  executionScope: 'cluster',
  dataSchema: deleteBucketTaskDataSchema
});

export const bucketTaskSchema = z.discriminatedUnion('type', [
  createBucketTaskDefinition.taskSchema,
  deleteBucketTaskDefinition.taskSchema
]);

/* types */

export type CreateBucketTaskData = z.infer<typeof createBucketTaskDataSchema>;
export type DeleteBucketTaskData = z.infer<typeof deleteBucketTaskDataSchema>;

export type CreateBucketTask = z.infer<typeof createBucketTaskDefinition.taskSchema>;
export type DeleteBucketTask = z.infer<typeof deleteBucketTaskDefinition.taskSchema>;

export type BucketTask = z.infer<typeof bucketTaskSchema>;
