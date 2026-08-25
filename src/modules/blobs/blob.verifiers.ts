import { InternodeDataLossError } from '@/errors/internode.errors';

import type { EnsureBlobExistsInput, GetBlobInput, GetBlobMetadataInput } from './blob.application';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from './blob.domain';
import { calculateBlobChecksum } from './blob.processors';

/* verifiers */

export const verifyGetBlobMetadataResult = (input: GetBlobMetadataInput, result: BlobMetadata): void => {
  if (result.blobId !== input.blobId) {
    throw new InternodeDataLossError('Data node returned metadata for a different blob');
  }
};

export const verifyGetBlobResult = (input: GetBlobInput, result: BlobMetadataWithBytes): void => {
  const actualSizeBytes = BigInt(result.bytes.length);
  const actualChecksumValue = calculateBlobChecksum(result.bytes);

  if (
    result.blobId !== input.blobId ||
    result.sizeBytes !== actualSizeBytes ||
    result.checksumAlgorithm !== BLOB_CHECKSUM_ALGORITHM ||
    result.checksumValue !== actualChecksumValue
  ) {
    throw new InternodeDataLossError('Data node returned inconsistent blob data');
  }
};

export const verifyEnsureBlobExistsResult = (input: EnsureBlobExistsInput, result: BlobMetadata): void => {
  const actualSizeBytes = BigInt(input.blob.bytes.length);
  const actualChecksumValue = calculateBlobChecksum(input.blob.bytes);

  if (
    result.blobId !== input.blob.blobId ||
    result.sizeBytes !== input.blob.sizeBytes ||
    result.sizeBytes !== actualSizeBytes ||
    result.checksumAlgorithm !== input.blob.checksumAlgorithm ||
    result.checksumAlgorithm !== BLOB_CHECKSUM_ALGORITHM ||
    result.checksumValue !== input.blob.checksumValue ||
    result.checksumValue !== actualChecksumValue
  ) {
    throw new InternodeDataLossError('Data node returned inconsistent blob metadata');
  }
};
