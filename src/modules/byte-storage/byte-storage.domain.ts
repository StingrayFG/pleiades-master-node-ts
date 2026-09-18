import { z } from 'zod';

/* field schemas */

export const BYTE_STORAGE_CHECKSUM_ALGORITHM = 'sha256';
export const BYTE_STORAGE_OBJECT_STATES = ['pending', 'active', 'deleting'] as const;

export const byteStorageIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const byteStorageSizeBytesSchema = z.bigint().nonnegative();
export const byteStorageChecksumSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const byteStorageChecksumAlgorithmSchema = z.literal(BYTE_STORAGE_CHECKSUM_ALGORITHM);
export const byteStorageObjectStateSchema = z.enum(BYTE_STORAGE_OBJECT_STATES);

/* object schemas */

export const byteStorageReferenceSchema = z.object({
  id: byteStorageIdSchema,

  sizeBytes: byteStorageSizeBytesSchema,
  checksum: byteStorageChecksumSchema,
  checksumAlgorithm: byteStorageChecksumAlgorithmSchema
});

export const byteStorageObjectSchema = byteStorageReferenceSchema.extend({
  state: byteStorageObjectStateSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

/* types */

export type ByteStorageId = z.infer<typeof byteStorageIdSchema>;
export type ByteStorageSizeBytes = z.infer<typeof byteStorageSizeBytesSchema>;
export type ByteStorageChecksum = z.infer<typeof byteStorageChecksumSchema>;
export type ByteStorageChecksumAlgorithm = z.infer<typeof byteStorageChecksumAlgorithmSchema>;
export type ByteStorageObjectState = z.infer<typeof byteStorageObjectStateSchema>;

export type ByteStorageReference = z.infer<typeof byteStorageReferenceSchema>;
export type ByteStorageObject = z.infer<typeof byteStorageObjectSchema>;
