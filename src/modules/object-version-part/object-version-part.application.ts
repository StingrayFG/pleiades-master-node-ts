import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { z } from 'zod';

import { internodeApplicationErrorSchema } from '@/errors/internode.errors';

import {
  blobChecksumAlgorithmSchema,
  blobChecksumValueSchema,
  blobIdSchema,
  blobMetadataWithBytesSchema,
  blobSizeBytesSchema
} from '@/modules/blobs/blob.domain';
import { dataNodeIdSchema, dataNodeSchema } from '@/modules/data-nodes/data-node.domain';
import {
  objectIdSchema,
  objectVersionNumberSchema,
  objectVersionTotalSizeBytesSchema
} from '@/modules/objects/object.domain';

import { partKeySchema, partReplicaStateSchema, partSchema, placementGroupSchema } from './object-version-part.domain';

/* service schemas */

export const listPartsByObjectVersionInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

export const getReplicaBlobResultSchema = z.discriminatedUnion('status', [
  z.object({
    dataNodeId: dataNodeIdSchema,
    status: z.literal('fulfilled'),
    blob: blobMetadataWithBytesSchema
  }),
  z.object({
    dataNodeId: dataNodeIdSchema,
    status: z.literal('rejected'),
    reason: internodeApplicationErrorSchema
  })
]);

export const createPartsInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema,
  totalSizeBytes: objectVersionTotalSizeBytesSchema,
  data: z.instanceof(Readable)
});

export const createPartInputSchema = z.object({
  part: partKeySchema.extend({
    bytes: z.instanceof(Buffer)
  }),
  availableDataNodes: z.array(dataNodeSchema)
});

export const createPartResultSchema = z.object({
  part: partSchema,
  responsibleDataNodes: z.array(dataNodeSchema)
});

export const createReplicaBlobResultSchema = z.discriminatedUnion('status', [
  z.object({
    dataNodeId: dataNodeIdSchema,
    status: z.literal('fulfilled')
  }),
  z.object({
    dataNodeId: dataNodeIdSchema,
    status: z.literal('rejected'),
    reason: internodeApplicationErrorSchema
  })
]);

/* repository schemas */

export const createPartWithReplicasRepositoryInputSchema = z.object({
  part: partKeySchema.extend({
    blobId: blobIdSchema,
    placementGroup: placementGroupSchema,
    sizeBytes: blobSizeBytesSchema,
    checksumAlgorithm: blobChecksumAlgorithmSchema,
    checksumValue: blobChecksumValueSchema
  }),
  replicaDataNodeIds: z.array(dataNodeIdSchema).min(1)
});

export const updateReplicaStatesRepositoryInputSchema = z
  .array(
    z.object({
      blobId: blobIdSchema,
      dataNodeId: dataNodeIdSchema,
      state: partReplicaStateSchema
    })
  )
  .min(1);

/* types */

export type ListPartsByObjectVersionInput = z.infer<typeof listPartsByObjectVersionInputSchema>;
export type GetReplicaBlobResult = z.infer<typeof getReplicaBlobResultSchema>;
export type CreatePartsInput = z.infer<typeof createPartsInputSchema>;
export type CreatePartInput = z.infer<typeof createPartInputSchema>;
export type CreatePartResult = z.infer<typeof createPartResultSchema>;
export type CreateReplicaBlobResult = z.infer<typeof createReplicaBlobResultSchema>;

export type CreatePartWithReplicasRepositoryInput = z.infer<typeof createPartWithReplicasRepositoryInputSchema>;
export type UpdateReplicaStatesRepositoryInput = z.infer<typeof updateReplicaStatesRepositoryInputSchema>;
