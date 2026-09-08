import { Readable } from 'node:stream';
import { z } from 'zod';

import { bucketIdSchema, bucketNameSchema } from '@/modules/buckets/bucket.domain';
import { userIdSchema } from '@/modules/users/user.domain';

import {
  objectIdSchema,
  objectKeySchema,
  objectSchema,
  objectVersionContentTypeSchema,
  objectVersionNumberSchema,
  objectVersionSchema,
  objectVersionTotalSizeBytesSchema
} from './object.domain';

/* service schemas */

export const getObjectMetadataInputSchema = z.object({
  userId: userIdSchema,

  bucketName: bucketNameSchema,
  objectKey: objectKeySchema
});

export const getObjectInputSchema = z.object({
  userId: userIdSchema,

  bucketName: bucketNameSchema,
  objectKey: objectKeySchema
});

export const getObjectResultSchema = z.object({
  objectVersion: objectVersionSchema,
  data: z.instanceof(Readable)
});

export const createObjectInputSchema = z.object({
  userId: userIdSchema,

  bucketName: bucketNameSchema,
  objectKey: objectKeySchema,

  totalSizeBytes: objectVersionTotalSizeBytesSchema,
  contentType: objectVersionContentTypeSchema,

  data: z.instanceof(Readable)
});

export const createObjectResultSchema = z.object({
  object: objectSchema,
  objectVersion: objectVersionSchema
});

/* repository schemas */

export const listPendingObjectVersionCleanupCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listDeletingObjectVersionCleanupCandidatesRepositoryInputSchema = z.object({
  limit: z.number().int().positive()
});

export const upsertObjectAndCreateVersionRepositoryInputSchema = z.object({
  objectKey: objectKeySchema,
  bucketId: bucketIdSchema,

  totalSizeBytes: objectVersionTotalSizeBytesSchema,
  contentType: objectVersionContentTypeSchema
});

export const upsertObjectAndCreateVersionRepositoryResultSchema = z.object({
  object: objectSchema,
  objectVersion: objectVersionSchema
});

export const claimObjectVersionCleanupRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema,

  updatedBefore: z.date()
});

export const commitObjectVersionRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

export const commitObjectVersionRepositoryResultSchema = z.object({
  object: objectSchema,
  objectVersion: objectVersionSchema
});

export const touchObjectVersionDeletionCandidateRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

export const deleteObjectVersionIfDeletingAndPartsGoneRepositoryInputSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema
});

/* types */

export type GetObjectMetadataInput = z.infer<typeof getObjectMetadataInputSchema>;
export type GetObjectInput = z.infer<typeof getObjectInputSchema>;
export type GetObjectResult = z.infer<typeof getObjectResultSchema>;
export type CreateObjectInput = z.infer<typeof createObjectInputSchema>;
export type CreateObjectResult = z.infer<typeof createObjectResultSchema>;

export type ListPendingObjectVersionCleanupCandidatesRepositoryInput = z.infer<
  typeof listPendingObjectVersionCleanupCandidatesRepositoryInputSchema
>;
export type ListDeletingObjectVersionCleanupCandidatesRepositoryInput = z.infer<
  typeof listDeletingObjectVersionCleanupCandidatesRepositoryInputSchema
>;
export type UpsertObjectAndCreateVersionRepositoryInput = z.infer<
  typeof upsertObjectAndCreateVersionRepositoryInputSchema
>;
export type UpsertObjectAndCreateVersionRepositoryResult = z.infer<
  typeof upsertObjectAndCreateVersionRepositoryResultSchema
>;
export type ClaimObjectVersionCleanupRepositoryInput = z.infer<typeof claimObjectVersionCleanupRepositoryInputSchema>;
export type CommitObjectVersionRepositoryInput = z.infer<typeof commitObjectVersionRepositoryInputSchema>;
export type CommitObjectVersionRepositoryResult = z.infer<typeof commitObjectVersionRepositoryResultSchema>;
export type TouchObjectVersionDeletionCandidateRepositoryInput = z.infer<
  typeof touchObjectVersionDeletionCandidateRepositoryInputSchema
>;
export type DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput = z.infer<
  typeof deleteObjectVersionIfDeletingAndPartsGoneRepositoryInputSchema
>;
