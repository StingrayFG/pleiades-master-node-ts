import { z } from 'zod';

import {
  blobChecksumAlgorithmSchema,
  blobChecksumValueSchema,
  blobIdSchema,
  blobSizeBytesSchema
} from '@/modules/blobs/blob.domain';
import { dataNodeIdSchema } from '@/modules/data-nodes/data-node.domain';
import { objectIdSchema, objectVersionNumberSchema } from '@/modules/objects/object.domain';

/* field schemas */

export const PART_REPLICA_STATES = ['pending', 'committed', 'deleting', 'corrupt', 'missing'] as const;

export const partNumberSchema = z.number().int().positive();
export const placementGroupSchema = z.number().int().nonnegative();
export const partReplicaStateSchema = z.enum(PART_REPLICA_STATES);

/* object schemas */

export const partKeySchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema,
  partNumber: partNumberSchema
});

export const partSchema = partKeySchema.extend({
  blobId: blobIdSchema,
  placementGroup: placementGroupSchema,
  sizeBytes: blobSizeBytesSchema,
  checksumAlgorithm: blobChecksumAlgorithmSchema,
  checksumValue: blobChecksumValueSchema,
  createdAt: z.date()
});

export const partReplicaSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,
  state: partReplicaStateSchema,
  createdAt: z.date(),
  lastVerifiedAt: z.date().nullable(),
  stateChangedAt: z.date(),
  updatedAt: z.date()
});

/* exports */

export type PartNumber = z.infer<typeof partNumberSchema>;
export type PlacementGroup = z.infer<typeof placementGroupSchema>;
export type PartReplicaState = z.infer<typeof partReplicaStateSchema>;

export type PartKey = z.infer<typeof partKeySchema>;
export type Part = z.infer<typeof partSchema>;
export type PartReplica = z.infer<typeof partReplicaSchema>;
