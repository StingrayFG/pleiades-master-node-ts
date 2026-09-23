import type { Object as PrismaObject, ObjectVersion as PrismaObjectVersion } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { Object, ObjectVersion } from '../object.domain';
import { mapPrismaObjectToDomainObject, mapPrismaObjectVersionToDomainObjectVersion } from '../object.mappers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaObject: PrismaObject = {
  id: '00000000-0000-4000-8000-000000000001',
  key: 'path/to/object',
  bucket_id: '00000000-0000-4000-8000-000000000002',
  current_version: 1,
  last_allocated_version: 1,
  created_at: now,
  updated_at: now
};

const object: Object = {
  id: prismaObject.id,
  key: prismaObject.key,
  bucketId: prismaObject.bucket_id,
  currentVersion: prismaObject.current_version,
  lastAllocatedVersion: prismaObject.last_allocated_version,
  createdAt: prismaObject.created_at,
  updatedAt: prismaObject.updated_at
};

const prismaObjectVersion: PrismaObjectVersion = {
  object_id: prismaObject.id,
  version: 1,
  state: 'committed',
  total_size_bytes: 12n,
  content_type: 'application/octet-stream',
  created_at: now,
  committed_at: now,
  updated_at: now
};

const objectVersion: ObjectVersion = {
  objectId: prismaObjectVersion.object_id,
  version: prismaObjectVersion.version,
  state: prismaObjectVersion.state,
  totalSizeBytes: prismaObjectVersion.total_size_bytes,
  contentType: prismaObjectVersion.content_type,
  createdAt: prismaObjectVersion.created_at,
  committedAt: prismaObjectVersion.committed_at,
  updatedAt: prismaObjectVersion.updated_at
};

/* tests */

describe('object mappers', () => {
  test('maps Prisma object entities to domain entities', () => {
    expect(mapPrismaObjectToDomainObject(prismaObject)).toEqual(object);
    expect(mapPrismaObjectVersionToDomainObjectVersion(prismaObjectVersion)).toEqual(objectVersion);
  });

  test('wraps invalid Prisma object data in mapper errors', () => {
    expect(() => mapPrismaObjectToDomainObject({ ...prismaObject, id: 'invalid' })).toThrow(GenericMapperError);
    expect(() => mapPrismaObjectVersionToDomainObjectVersion({ ...prismaObjectVersion, version: 0 })).toThrow(
      GenericMapperError
    );
  });
});
