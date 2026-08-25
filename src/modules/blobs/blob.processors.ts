import { createHash } from 'node:crypto';

import { BLOB_CHECKSUM_ALGORITHM, blobChecksumValueSchema, type BlobChecksumValue } from './blob.domain';

/* processors */

export const calculateBlobChecksum = (data: Uint8Array): BlobChecksumValue => {
  return blobChecksumValueSchema.parse(createHash(BLOB_CHECKSUM_ALGORITHM).update(data).digest('hex'));
};
