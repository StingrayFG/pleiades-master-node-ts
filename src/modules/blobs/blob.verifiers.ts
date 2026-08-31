import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeDataLossError } from '@/errors/internode.errors';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from './blob.application';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from './blob.domain';
import { calculateBlobChecksum } from './blob.processors';

/* verifiers */

export const verifyGetBlobMetadataResult = (input: DataNodeBlobInput, result: BlobMetadata): void => {
  if (result.blobId !== input.blobId) {
    throw new InternodeDataLossError('Data node returned metadata for a different blob');
  }
};

export const verifyGetBlobResult = (input: DataNodeBlobInput, result: BlobMetadataWithBytes): void => {
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

export const verifyBlobResult = (input: DataNodeBlobInput, result: BlobMetadata): void => {
  if (result.blobId !== input.blobId) {
    throw new InternodeDataLossError('Data node returned verification metadata for a different blob');
  }
};

export const verifyEnsureBlobExistsInput = (input: DataNodeBlobWithBytesInput): void => {
  const actualSizeBytes = BigInt(input.blob.bytes.length);
  const actualChecksumValue = calculateBlobChecksum(input.blob.bytes);

  if (
    input.blob.sizeBytes !== actualSizeBytes ||
    input.blob.checksumAlgorithm !== BLOB_CHECKSUM_ALGORITHM ||
    input.blob.checksumValue !== actualChecksumValue
  ) {
    throw new GenericInternalServerError('Blob input metadata is inconsistent with blob data');
  }
};

export const verifyEnsureBlobExistsResult = (input: DataNodeBlobWithBytesInput, result: BlobMetadata): void => {
  if (
    result.blobId !== input.blob.blobId ||
    result.sizeBytes !== input.blob.sizeBytes ||
    result.checksumAlgorithm !== input.blob.checksumAlgorithm ||
    result.checksumValue !== input.blob.checksumValue
  ) {
    throw new InternodeDataLossError('Data node returned inconsistent blob metadata');
  }
};
