import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonBytesCodec } from '@/common/serializers/bytes.serializer';
import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { bucketIdSchema } from '@/modules/buckets/bucket.domain';
import { createDehydratedTaskDefinition } from '@/modules/tasks/task.definition';

import { objectKeySchema, objectSchema, objectVersionContentTypeSchema, objectVersionSchema } from './object.domain';

/* data schemas */

export const createObjectTaskDataSchema = z.object({
  objectKey: objectKeySchema,
  bucketId: bucketIdSchema,

  totalSizeBytes: jsonBigIntCodec,
  contentType: objectVersionContentTypeSchema,

  data: jsonBytesCodec
});

export const persistedCreateObjectTaskDataSchema = z.object({
  objectKey: objectKeySchema,
  bucketId: bucketIdSchema,

  totalSizeBytes: jsonBigIntCodec,
  contentType: objectVersionContentTypeSchema
});

/* result schemas */

export const createObjectTaskResultSchema = z.object({
  object: objectSchema.extend({
    createdAt: jsonDateCodec,
    updatedAt: jsonDateCodec
  }),
  objectVersion: objectVersionSchema.extend({
    totalSizeBytes: jsonBigIntCodec,

    createdAt: jsonDateCodec,
    committedAt: jsonDateCodec.nullable(),
    updatedAt: jsonDateCodec
  })
});

/* definitions */

export const createObjectTaskDefinition = createDehydratedTaskDefinition({
  type: 'object.create',
  executionScope: 'cluster',

  dataSchema: createObjectTaskDataSchema,
  persistedDataSchema: persistedCreateObjectTaskDataSchema,
  dehydrateData: (data) => ({
    data: {
      objectKey: data.objectKey,
      bucketId: data.bucketId,

      totalSizeBytes: data.totalSizeBytes,
      contentType: data.contentType
    },
    payload: data.data
  }),
  hydrateData: (data, payload) => ({
    ...data,
    data: payload
  }),

  resultSchema: createObjectTaskResultSchema
});

export const objectTaskSchema = z.discriminatedUnion('type', [createObjectTaskDefinition.taskSchema]);

/* types */

export type CreateObjectTaskData = z.infer<typeof createObjectTaskDataSchema>;
export type PersistedCreateObjectTaskData = z.infer<typeof persistedCreateObjectTaskDataSchema>;

export type CreateObjectTask = z.infer<typeof createObjectTaskDefinition.taskSchema>;

export type ObjectTask = z.infer<typeof objectTaskSchema>;
