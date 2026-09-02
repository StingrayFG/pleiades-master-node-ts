import type { Object as PrismaObject, ObjectVersion as PrismaObjectVersion } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { objectSchema, objectVersionSchema, type Object, type ObjectVersion } from './object.domain';

/* prisma -> domain */

export const mapPrismaObjectToDomainObject = (object: PrismaObject): Object => {
  return withMapperError('Failed to map Prisma object to domain object', () =>
    objectSchema.parse({
      id: object.id,
      key: object.key,
      currentVersion: object.current_version,
      lastAllocatedVersion: object.last_allocated_version,
      bucketId: object.bucket_id,
      createdAt: object.created_at,
      updatedAt: object.updated_at
    })
  );
};

export const mapPrismaObjectVersionToDomainObjectVersion = (objectVersion: PrismaObjectVersion): ObjectVersion => {
  return withMapperError('Failed to map Prisma object version to domain object version', () =>
    objectVersionSchema.parse({
      objectId: objectVersion.object_id,
      version: objectVersion.version,
      state: objectVersion.state,
      totalSizeBytes: objectVersion.total_size_bytes,
      contentType: objectVersion.content_type,
      createdAt: objectVersion.created_at,
      committedAt: objectVersion.committed_at,
      updatedAt: objectVersion.updated_at
    })
  );
};
