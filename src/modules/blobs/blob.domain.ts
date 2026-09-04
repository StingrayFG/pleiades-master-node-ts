import { Buffer } from 'node:buffer';
import { z } from 'zod';

/* field schemas */

export const BLOB_CHECKSUM_ALGORITHM = 'sha256';
export const DATA_NODE_BLOB_STATES = ['pending', 'temp', 'committed', 'deleting', 'corrupt', 'missing'] as const;

export const blobIdSchema = z.uuid();
export const blobSizeBytesSchema = z.bigint().nonnegative();
export const blobChecksumAlgorithmSchema = z.literal(BLOB_CHECKSUM_ALGORITHM);
export const blobChecksumValueSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const dataNodeBlobStateSchema = z.enum(DATA_NODE_BLOB_STATES);

/* object schemas */

export const blobMetadataSchema = z.object({
  blobId: blobIdSchema,

  sizeBytes: blobSizeBytesSchema,
  checksumAlgorithm: blobChecksumAlgorithmSchema,
  checksumValue: blobChecksumValueSchema
});

export const blobMetadataWithBytesSchema = blobMetadataSchema.extend({
  bytes: z.instanceof(Buffer)
});

/* types */

export type BlobId = z.infer<typeof blobIdSchema>;
export type BlobSizeBytes = z.infer<typeof blobSizeBytesSchema>;
export type BlobChecksumAlgorithm = z.infer<typeof blobChecksumAlgorithmSchema>;
export type BlobChecksumValue = z.infer<typeof blobChecksumValueSchema>;
export type DataNodeBlobState = z.infer<typeof dataNodeBlobStateSchema>;

export type BlobMetadata = z.infer<typeof blobMetadataSchema>;
export type BlobMetadataWithBytes = z.infer<typeof blobMetadataWithBytesSchema>;
