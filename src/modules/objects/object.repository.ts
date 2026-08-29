import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import type { BucketId } from '@/modules/buckets/bucket.domain';

import type {
  CommitObjectVersionRepositoryInput,
  CommitObjectVersionRepositoryResult,
  UpsertObjectAndCreateVersionRepositoryInput,
  UpsertObjectAndCreateVersionRepositoryResult
} from './object.application';
import type { Object, ObjectId, ObjectKey, ObjectVersion, ObjectVersionNumber } from './object.domain';
import { mapPrismaObjectToDomainObject, mapPrismaObjectVersionToDomainObjectVersion } from './object.mappers';

/* contract */

type ObjectRepositoryContract = {
  listObjectVersions(objectId: ObjectId): Promise<ObjectVersion[]>;
  findObjectById(id: ObjectId): Promise<Object | null>;
  findObjectByKey(bucketId: BucketId, key: ObjectKey): Promise<Object | null>;
  findObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<ObjectVersion | null>;
  commitObjectVersion(input: CommitObjectVersionRepositoryInput): Promise<CommitObjectVersionRepositoryResult>;
  upsertObjectAndCreateVersion(
    input: UpsertObjectAndCreateVersionRepositoryInput
  ): Promise<UpsertObjectAndCreateVersionRepositoryResult>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ObjectRepository implements ObjectRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listObjectVersions(objectId: ObjectId): Promise<ObjectVersion[]> {
    let objectVersions;

    try {
      objectVersions = await this.prisma.objectVersion.findMany({
        where: {
          object_id: objectId
        },
        orderBy: {
          version: 'desc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objectVersions.map(mapPrismaObjectVersionToDomainObjectVersion);
  }

  async findObjectById(id: ObjectId): Promise<Object | null> {
    let object;

    try {
      object = await this.prisma.object.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return object ? mapPrismaObjectToDomainObject(object) : null;
  }

  async findObjectByKey(bucketId: BucketId, key: ObjectKey): Promise<Object | null> {
    let object;

    try {
      object = await this.prisma.object.findUnique({
        where: {
          bucket_id_key: {
            bucket_id: bucketId,
            key
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return object ? mapPrismaObjectToDomainObject(object) : null;
  }

  async findObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<ObjectVersion | null> {
    let objectVersion;

    try {
      objectVersion = await this.prisma.objectVersion.findUnique({
        where: {
          object_id_version: {
            object_id: objectId,
            version
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objectVersion ? mapPrismaObjectVersionToDomainObjectVersion(objectVersion) : null;
  }

  async commitObjectVersion(input: CommitObjectVersionRepositoryInput): Promise<CommitObjectVersionRepositoryResult> {
    let objectVersionCommit;

    try {
      objectVersionCommit = await this.prisma.$transaction(async (tx) => {
        const objectVersion = await tx.objectVersion.update({
          where: {
            object_id_version: {
              object_id: input.objectId,
              version: input.version
            },
            state: 'pending'
          },
          data: {
            state: 'committed',
            committed_at: new Date()
          }
        });

        await tx.object.updateMany({
          where: {
            id: input.objectId,
            OR: [
              {
                current_version: null
              },
              {
                current_version: {
                  lt: input.version
                }
              }
            ]
          },
          data: {
            current_version: input.version
          }
        });

        const object = await tx.object.findUniqueOrThrow({
          where: {
            id: input.objectId
          }
        });

        return {
          object,
          objectVersion
        };
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return {
      object: mapPrismaObjectToDomainObject(objectVersionCommit.object),
      objectVersion: mapPrismaObjectVersionToDomainObjectVersion(objectVersionCommit.objectVersion)
    };
  }

  async upsertObjectAndCreateVersion(
    input: UpsertObjectAndCreateVersionRepositoryInput
  ): Promise<UpsertObjectAndCreateVersionRepositoryResult> {
    let objectVersionAllocation;

    try {
      objectVersionAllocation = await this.prisma.$transaction(async (tx) => {
        const object = await tx.object.upsert({
          where: {
            bucket_id_key: {
              bucket_id: input.bucketId,
              key: input.objectKey
            }
          },
          create: {
            key: input.objectKey,
            last_allocated_version: 1,
            bucket_id: input.bucketId
          },
          update: {
            last_allocated_version: {
              increment: 1
            }
          }
        });

        const objectVersion = await tx.objectVersion.create({
          data: {
            object_id: object.id,
            version: object.last_allocated_version,
            state: 'pending',
            total_size_bytes: input.totalSizeBytes,
            content_type: input.contentType
          }
        });

        return {
          object,
          objectVersion
        };
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return {
      object: mapPrismaObjectToDomainObject(objectVersionAllocation.object),
      objectVersion: mapPrismaObjectVersionToDomainObjectVersion(objectVersionAllocation.objectVersion)
    };
  }
}

/* exports */

export { ObjectRepository };

export type { ObjectRepositoryContract };
