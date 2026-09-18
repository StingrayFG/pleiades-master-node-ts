import type { ByteStorageObject as PrismaByteStorageObject } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import {
  byteStorageObjectSchema,
  byteStorageReferenceSchema,
  type ByteStorageObject,
  type ByteStorageReference
} from './byte-storage.domain';

/* domain -> domain */

export const mapByteStorageObjectToByteStorageReference = (object: ByteStorageObject): ByteStorageReference => {
  return withMapperError('Failed to map byte storage object to byte storage reference', () => {
    return byteStorageReferenceSchema.parse({
      id: object.id,

      sizeBytes: object.sizeBytes,
      checksum: object.checksum,
      checksumAlgorithm: object.checksumAlgorithm
    });
  });
};

/* prisma -> domain */

export const mapPrismaByteStorageObjectToDomainByteStorageObject = (
  object: PrismaByteStorageObject
): ByteStorageObject => {
  return withMapperError('Failed to map Prisma byte storage object to domain byte storage object', () => {
    return byteStorageObjectSchema.parse({
      id: object.id,

      sizeBytes: object.size_bytes,
      checksum: object.checksum,
      checksumAlgorithm: object.checksum_algorithm,

      state: object.state,

      createdAt: object.created_at,
      updatedAt: object.updated_at
    });
  });
};
