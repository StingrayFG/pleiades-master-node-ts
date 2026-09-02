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

export const listPartReplicaVerificationCandidatesRepositoryInputSchema = z.object({
  verifiedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listPendingPartReplicaReconciliationCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listPartReplicaRepairCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listPartReplicaDeletionCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

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

export const claimPartReplicaRepairRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  failedDataNodeId: dataNodeIdSchema,
  replacementDataNodeId: dataNodeIdSchema,

  expectedState: z.enum(['missing', 'corrupt'])
});

export const applyObjectVersionDeletionToPartReplicasRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

export const applyPartReplicaVerificationRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,

  state: partReplicaStateSchema,

  verifiedAt: z.date().optional()
});

export const applyPartReplicaRepairRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,

  state: partReplicaStateSchema,

  verifiedAt: z.date().optional()
});

export const applyPendingPartReplicaReconciliationRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,

  state: partReplicaStateSchema,

  verifiedAt: z.date().optional()
});

export const applyRedundantPartReplicaDeletionRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,

  expectedState: z.enum(['missing', 'corrupt'])
});

export const updatePartReplicaStatesRepositoryInputSchema = z
  .array(
    z.object({
      blobId: blobIdSchema,
      dataNodeId: dataNodeIdSchema,

      expectedState: partReplicaStateSchema,
      state: partReplicaStateSchema
    })
  )
  .min(1);

export const touchPartReplicaVerificationCandidateRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema
});

export const touchPartReplicaRepairCandidateRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema,

  state: z.enum(['missing', 'corrupt'])
});

export const touchPartReplicaDeletionCandidateRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema
});

export const deletePartReplicaIfDeletingRepositoryInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeId: dataNodeIdSchema
});

export const deleteReplicaFreePartsByObjectVersionRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

/* service types */

export type ListPartsByObjectVersionInput = z.infer<typeof listPartsByObjectVersionInputSchema>;
export type GetReplicaBlobResult = z.infer<typeof getReplicaBlobResultSchema>;
export type CreatePartsInput = z.infer<typeof createPartsInputSchema>;
export type CreatePartInput = z.infer<typeof createPartInputSchema>;
export type CreatePartResult = z.infer<typeof createPartResultSchema>;
export type CreateReplicaBlobResult = z.infer<typeof createReplicaBlobResultSchema>;

/* repository types */

export type ListPartReplicaVerificationCandidatesRepositoryInput = z.infer<
  typeof listPartReplicaVerificationCandidatesRepositoryInputSchema
>;
export type ListPendingPartReplicaReconciliationCandidatesRepositoryInput = z.infer<
  typeof listPendingPartReplicaReconciliationCandidatesRepositoryInputSchema
>;
export type ListPartReplicaRepairCandidatesRepositoryInput = z.infer<
  typeof listPartReplicaRepairCandidatesRepositoryInputSchema
>;
export type ListPartReplicaDeletionCandidatesRepositoryInput = z.infer<
  typeof listPartReplicaDeletionCandidatesRepositoryInputSchema
>;
export type CreatePartWithReplicasRepositoryInput = z.infer<typeof createPartWithReplicasRepositoryInputSchema>;
export type ClaimPartReplicaRepairRepositoryInput = z.infer<typeof claimPartReplicaRepairRepositoryInputSchema>;
export type ApplyObjectVersionDeletionToPartReplicasRepositoryInput = z.infer<
  typeof applyObjectVersionDeletionToPartReplicasRepositoryInputSchema
>;
export type ApplyPartReplicaVerificationRepositoryInput = z.infer<
  typeof applyPartReplicaVerificationRepositoryInputSchema
>;
export type ApplyPartReplicaRepairRepositoryInput = z.infer<typeof applyPartReplicaRepairRepositoryInputSchema>;
export type ApplyPendingPartReplicaReconciliationRepositoryInput = z.infer<
  typeof applyPendingPartReplicaReconciliationRepositoryInputSchema
>;
export type ApplyRedundantPartReplicaDeletionRepositoryInput = z.infer<
  typeof applyRedundantPartReplicaDeletionRepositoryInputSchema
>;
export type UpdatePartReplicaStatesRepositoryInput = z.infer<typeof updatePartReplicaStatesRepositoryInputSchema>;
export type TouchPartReplicaVerificationCandidateRepositoryInput = z.infer<
  typeof touchPartReplicaVerificationCandidateRepositoryInputSchema
>;
export type TouchPartReplicaRepairCandidateRepositoryInput = z.infer<
  typeof touchPartReplicaRepairCandidateRepositoryInputSchema
>;
export type TouchPartReplicaDeletionCandidateRepositoryInput = z.infer<
  typeof touchPartReplicaDeletionCandidateRepositoryInputSchema
>;
export type DeletePartReplicaIfDeletingRepositoryInput = z.infer<
  typeof deletePartReplicaIfDeletingRepositoryInputSchema
>;
export type DeleteReplicaFreePartsByObjectVersionRepositoryInput = z.infer<
  typeof deleteReplicaFreePartsByObjectVersionRepositoryInputSchema
>;
