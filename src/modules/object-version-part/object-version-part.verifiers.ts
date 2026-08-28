import { InternodeDataLossError } from '@/errors/internode.errors';

import type { BlobMetadata } from '@/modules/blobs/blob.domain';

import type { Part } from './object-version-part.domain';

/* verifiers */

export const verifyPartBlob = (part: Part, blob: BlobMetadata): void => {
  if (
    blob.blobId !== part.blobId ||
    blob.sizeBytes !== part.sizeBytes ||
    blob.checksumAlgorithm !== part.checksumAlgorithm ||
    blob.checksumValue !== part.checksumValue
  ) {
    throw new InternodeDataLossError('Data node returned blob metadata inconsistent with object version part');
  }
};
