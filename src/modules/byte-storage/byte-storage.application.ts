import { z } from 'zod';

import { byteStorageIdSchema, byteStorageObjectStateSchema, byteStorageReferenceSchema } from './byte-storage.domain';

/* schemas */

export const createByteStorageObjectRepositoryInputSchema = byteStorageReferenceSchema.extend({
  state: byteStorageObjectStateSchema
});

export const transitionByteStorageObjectStateRepositoryInputSchema = z.object({
  id: byteStorageIdSchema,

  from: byteStorageObjectStateSchema,
  to: byteStorageObjectStateSchema
});

export const touchByteStorageObjectDeletionCandidateRepositoryInputSchema = z.object({
  id: byteStorageIdSchema
});

export const listPendingCleanupCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listDeletingCleanupCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

/* types */

export type CreateByteStorageObjectRepositoryInput = z.infer<typeof createByteStorageObjectRepositoryInputSchema>;
export type TransitionByteStorageObjectStateRepositoryInput = z.infer<
  typeof transitionByteStorageObjectStateRepositoryInputSchema
>;
export type TouchByteStorageObjectDeletionCandidateRepositoryInput = z.infer<
  typeof touchByteStorageObjectDeletionCandidateRepositoryInputSchema
>;
export type ListPendingCleanupCandidatesRepositoryInput = z.infer<
  typeof listPendingCleanupCandidatesRepositoryInputSchema
>;
export type ListDeletingCleanupCandidatesRepositoryInput = z.infer<
  typeof listDeletingCleanupCandidatesRepositoryInputSchema
>;
