import { GenericConflictError } from '@/errors/application.errors';

import type { ByteStorageObject, ByteStorageReference } from './byte-storage.domain';

/* verifiers */

export const verifyExistingByteStorageObject = (
  object: ByteStorageObject,
  reference: ByteStorageReference
): void => {
  if (
    object.id !== reference.id ||
    object.sizeBytes !== reference.sizeBytes ||
    object.checksum !== reference.checksum ||
    object.checksumAlgorithm !== reference.checksumAlgorithm
  ) {
    throw new GenericConflictError('The byte storage ID is already associated with different bytes');
  }
};
