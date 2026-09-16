import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeDataLossError } from '@/errors/internode.errors';

import {
  BLOB_CHECKSUM_ALGORITHM,
  type BlobId,
  type BlobMetadata,
  type BlobMetadataWithBytes
} from './blob.domain';
import { calculateBlobChecksum } from './blob.processors';

/* verifiers */

export const verifyBlobMetadataIdentity = (expectedId: BlobId, actual: BlobMetadata): void => {
  if (expectedId !== actual.blobId) {
    throw new InternodeDataLossError('Data node returned metadata for a different blob');
  }
};

export const verifyBlobMetadataMatch = (expected: BlobMetadata, actual: BlobMetadata): void => {
  if (
    actual.blobId !== expected.blobId ||
    actual.sizeBytes !== expected.sizeBytes ||
    actual.checksumAlgorithm !== expected.checksumAlgorithm ||
    actual.checksumValue !== expected.checksumValue
  ) {
    throw new InternodeDataLossError('Data node returned inconsistent blob metadata');
  }
};

export const verifyBlobIntegrity = (expectedId: BlobId, actual: BlobMetadataWithBytes): void => {
  const actualSizeBytes = BigInt(actual.bytes.length);
  const actualChecksumValue = calculateBlobChecksum(actual.bytes);

  if (
    actual.blobId !== expectedId ||
    actual.sizeBytes !== actualSizeBytes ||
    actual.checksumAlgorithm !== BLOB_CHECKSUM_ALGORITHM ||
    actual.checksumValue !== actualChecksumValue
  ) {
    throw new InternodeDataLossError('Data node returned inconsistent blob data');
  }
};

export const verifySuppliedBlobIntegrity = (actual: BlobMetadataWithBytes, maxSizeBytes: bigint): void => {
  const actualSizeBytes = BigInt(actual.bytes.length);
  const actualChecksumValue = calculateBlobChecksum(actual.bytes);

  if (actualSizeBytes > maxSizeBytes) {
    throw new GenericInternalServerError('Blob input exceeds the configured maximum size');
  }

  if (
    actual.sizeBytes !== actualSizeBytes ||
    actual.checksumAlgorithm !== BLOB_CHECKSUM_ALGORITHM ||
    actual.checksumValue !== actualChecksumValue
  ) {
    throw new GenericInternalServerError('Blob input metadata is inconsistent with blob data');
  }
};
