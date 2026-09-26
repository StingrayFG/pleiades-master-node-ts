import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { createTaskDefinition } from '@/modules/tasks/task.definition';
import { userIdSchema } from '@/modules/users/user.domain';

import { bucketIdSchema, bucketNameSchema, bucketSchema } from './bucket.domain';

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

/* result schemas */

export const bucketTaskResultSchema = bucketSchema.extend({
  createdAt: jsonDateCodec,
  updatedAt: jsonDateCodec,

  revision: jsonBigIntCodec
});

/* definitions */

export const createBucketTaskDefinition = createTaskDefinition({
  type: 'bucket.create',
  executionScope: 'cluster',

  dataSchema: createBucketTaskDataSchema,

  resultSchema: bucketTaskResultSchema
});

export const deleteBucketTaskDefinition = createTaskDefinition({
  type: 'bucket.delete',
  executionScope: 'cluster',

  dataSchema: deleteBucketTaskDataSchema,

  resultSchema: bucketTaskResultSchema.nullable()
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
