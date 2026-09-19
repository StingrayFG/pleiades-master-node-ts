import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonBytesCodec } from '@/common/serializers/bytes.serializer';
import { bucketIdSchema } from '@/modules/buckets/bucket.domain';
import { createDehydratedTaskDefinition } from '@/modules/tasks/task.definition';

import type { CreateObjectResult } from './object.application';
import { objectKeySchema, objectVersionContentTypeSchema } from './object.domain';

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

/* definitions */

export const createObjectTaskDefinition = createDehydratedTaskDefinition<
  CreateObjectTaskData,
  PersistedCreateObjectTaskData,
  CreateObjectResult
>({
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
  })
});

export const objectTaskSchema = z.discriminatedUnion('type', [createObjectTaskDefinition.taskSchema]);

/* types */

export type CreateObjectTaskData = z.infer<typeof createObjectTaskDataSchema>;
export type PersistedCreateObjectTaskData = z.infer<typeof persistedCreateObjectTaskDataSchema>;

export type CreateObjectTask = z.infer<typeof createObjectTaskDefinition.taskSchema>;

export type ObjectTask = z.infer<typeof objectTaskSchema>;
