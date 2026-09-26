import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonBytesCodec } from '@/common/serializers/bytes.serializer';
import { dataNodeEndpointSchema } from '@/modules/data-nodes/data-node.domain';
import { createDehydratedTaskDefinition, createTaskDefinition } from '@/modules/tasks/task.definition';

import { blobIdSchema, blobMetadataSchema } from './blob.domain';

/* data schemas */

export const ensureBlobExistsTaskDataSchema = z.object({
  blob: blobMetadataSchema.extend({
    sizeBytes: jsonBigIntCodec,
    bytes: jsonBytesCodec
  }),

  dataNodeEndpoint: dataNodeEndpointSchema
});

export const persistedEnsureBlobExistsTaskDataSchema = z.object({
  blob: blobMetadataSchema.extend({
    sizeBytes: jsonBigIntCodec
  }),

  dataNodeEndpoint: dataNodeEndpointSchema
});

export const deleteBlobTaskDataSchema = z.object({
  blobId: blobIdSchema,

  dataNodeEndpoint: dataNodeEndpointSchema
});

/* result schemas */

export const ensureBlobExistsTaskResultSchema = blobMetadataSchema.extend({
  sizeBytes: jsonBigIntCodec
});

/* definitions */

export const ensureBlobExistsTaskDefinition = createDehydratedTaskDefinition({
  type: 'blob.ensure-exists',
  executionScope: 'cluster',

  dataSchema: ensureBlobExistsTaskDataSchema,
  persistedDataSchema: persistedEnsureBlobExistsTaskDataSchema,
  dehydrateData: (data) => ({
    data: {
      blob: {
        blobId: data.blob.blobId,

        sizeBytes: data.blob.sizeBytes,
        checksumAlgorithm: data.blob.checksumAlgorithm,
        checksumValue: data.blob.checksumValue
      },

      dataNodeEndpoint: data.dataNodeEndpoint
    },
    payload: data.blob.bytes
  }),
  hydrateData: (data, payload) => ({
    blob: {
      ...data.blob,
      bytes: payload
    },

    dataNodeEndpoint: data.dataNodeEndpoint
  }),

  resultSchema: ensureBlobExistsTaskResultSchema
});

export const deleteBlobTaskDefinition = createTaskDefinition({
  type: 'blob.delete',
  executionScope: 'cluster',

  dataSchema: deleteBlobTaskDataSchema
});

export const blobTaskSchema = z.discriminatedUnion('type', [
  ensureBlobExistsTaskDefinition.taskSchema,
  deleteBlobTaskDefinition.taskSchema
]);

/* types */

export type EnsureBlobExistsTaskData = z.infer<typeof ensureBlobExistsTaskDataSchema>;
export type PersistedEnsureBlobExistsTaskData = z.infer<typeof persistedEnsureBlobExistsTaskDataSchema>;
export type DeleteBlobTaskData = z.infer<typeof deleteBlobTaskDataSchema>;

export type EnsureBlobExistsTask = z.infer<typeof ensureBlobExistsTaskDefinition.taskSchema>;
export type DeleteBlobTask = z.infer<typeof deleteBlobTaskDefinition.taskSchema>;

export type BlobTask = z.infer<typeof blobTaskSchema>;
