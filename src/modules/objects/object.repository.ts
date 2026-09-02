import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericDataLossError, GenericFailedPreconditionError } from '@/errors/application.errors';

import type { BucketId } from '@/modules/buckets/bucket.domain';

import type {
  ClaimObjectVersionCleanupRepositoryInput,
  CommitObjectVersionRepositoryInput,
  CommitObjectVersionRepositoryResult,
  DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput,
  ListDeletingObjectVersionCleanupCandidatesRepositoryInput,
  ListPendingObjectVersionCleanupCandidatesRepositoryInput,
  TouchObjectVersionDeletionCandidateRepositoryInput,
  UpsertObjectAndCreateVersionRepositoryInput,
  UpsertObjectAndCreateVersionRepositoryResult
} from './object.application';
import type { Object, ObjectId, ObjectKey, ObjectVersion, ObjectVersionNumber } from './object.domain';
import { mapPrismaObjectToDomainObject, mapPrismaObjectVersionToDomainObjectVersion } from './object.mappers';

/* contract */

type ObjectRepositoryContract = {
  // list
  listObjectVersions(objectId: ObjectId): Promise<ObjectVersion[]>;
  listPendingObjectVersionCleanupCandidates(
    input: ListPendingObjectVersionCleanupCandidatesRepositoryInput
  ): Promise<ObjectVersion[]>;
  listDeletingObjectVersionCleanupCandidates(
    input: ListDeletingObjectVersionCleanupCandidatesRepositoryInput
  ): Promise<ObjectVersion[]>;

  // find
  findObjectById(id: ObjectId): Promise<Object | null>;
  findObjectByKey(bucketId: BucketId, key: ObjectKey): Promise<Object | null>;
  findObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<ObjectVersion | null>;

  // upsert
  upsertObjectAndCreateVersion(
    input: UpsertObjectAndCreateVersionRepositoryInput
  ): Promise<UpsertObjectAndCreateVersionRepositoryResult>;

  // claim
  claimObjectVersionCleanup(input: ClaimObjectVersionCleanupRepositoryInput): Promise<boolean>;

  // commit
  commitObjectVersion(input: CommitObjectVersionRepositoryInput): Promise<CommitObjectVersionRepositoryResult>;

  // touch
  touchObjectVersionDeletionCandidate(input: TouchObjectVersionDeletionCandidateRepositoryInput): Promise<boolean>;

  // delete
  deleteObjectVersionIfDeletingAndPartsGone(
    input: DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput
  ): Promise<boolean>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ObjectRepository implements ObjectRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  /* list methods */

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

  async listPendingObjectVersionCleanupCandidates(
    input: ListPendingObjectVersionCleanupCandidatesRepositoryInput
  ): Promise<ObjectVersion[]> {
    let objectVersions;

    try {
      objectVersions = await this.prisma.objectVersion.findMany({
        where: {
          state: 'pending',
          updated_at: {
            lte: input.updatedBefore
          }
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objectVersions.map(mapPrismaObjectVersionToDomainObjectVersion);
  }

  async listDeletingObjectVersionCleanupCandidates(
    input: ListDeletingObjectVersionCleanupCandidatesRepositoryInput
  ): Promise<ObjectVersion[]> {
    let objectVersions;

    try {
      objectVersions = await this.prisma.objectVersion.findMany({
        where: {
          state: 'deleting'
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objectVersions.map(mapPrismaObjectVersionToDomainObjectVersion);
  }

  /* find methods */

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

  /* upsert methods */

  async upsertObjectAndCreateVersion(
    input: UpsertObjectAndCreateVersionRepositoryInput
  ): Promise<UpsertObjectAndCreateVersionRepositoryResult> {
    let objectVersionAllocation;

    try {
      objectVersionAllocation = await this.prisma.$transaction(async (tx) => {
        const activeBuckets = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Bucket"
          WHERE id = ${input.bucketId}
            AND state = 'active'
          FOR UPDATE
        `;

        if (activeBuckets.length !== 1) {
          throw new GenericFailedPreconditionError('Bucket is not active');
        }

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

  /* claim methods */

  async claimObjectVersionCleanup(input: ClaimObjectVersionCleanupRepositoryInput): Promise<boolean> {
    let cleanupClaimResult;

    try {
      cleanupClaimResult = await this.prisma.objectVersion.updateMany({
        where: {
          object_id: input.objectId,
          version: input.version,
          state: 'pending',
          updated_at: {
            lte: input.updatedBefore
          }
        },
        data: {
          state: 'deleting'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return cleanupClaimResult.count === 1;
  }

  /* commit methods */

  async commitObjectVersion(input: CommitObjectVersionRepositoryInput): Promise<CommitObjectVersionRepositoryResult> {
    let objectVersionCommit;

    try {
      objectVersionCommit = await this.prisma.$transaction(async (tx) => {
        const commitResult = await tx.objectVersion.updateMany({
          where: {
            object_id: input.objectId,
            version: input.version,
            state: 'pending'
          },
          data: {
            state: 'committed',
            committed_at: new Date()
          }
        });

        if (commitResult.count === 0) {
          const existingObjectVersion = await tx.objectVersion.findUnique({
            where: {
              object_id_version: {
                object_id: input.objectId,
                version: input.version
              }
            }
          });

          if (!existingObjectVersion) {
            throw new GenericDataLossError('Object version disappeared before commit');
          }

          throw new GenericFailedPreconditionError('Object version is not pending');
        }

        const objectVersion = await tx.objectVersion.findUnique({
          where: {
            object_id_version: {
              object_id: input.objectId,
              version: input.version
            }
          }
        });

        if (!objectVersion) {
          throw new GenericDataLossError('Committed object version could not be found');
        }

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

        const object = await tx.object.findUnique({
          where: {
            id: input.objectId
          }
        });

        if (!object) {
          throw new GenericDataLossError('Object disappeared during object version commit');
        }

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

  /* touch methods */

  async touchObjectVersionDeletionCandidate(
    input: TouchObjectVersionDeletionCandidateRepositoryInput
  ): Promise<boolean> {
    let deletionCandidateUpdateResult;

    try {
      deletionCandidateUpdateResult = await this.prisma.objectVersion.updateMany({
        where: {
          object_id: input.objectId,
          version: input.version,
          state: 'deleting'
        },
        data: {
          state: 'deleting'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return deletionCandidateUpdateResult.count === 1;
  }

  /* delete methods */

  async deleteObjectVersionIfDeletingAndPartsGone(
    input: DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput
  ): Promise<boolean> {
    let objectVersionDeleteResult;

    try {
      objectVersionDeleteResult = await this.prisma.objectVersion.deleteMany({
        where: {
          object_id: input.objectId,
          version: input.version,
          state: 'deleting',
          parts: {
            none: {}
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objectVersionDeleteResult.count === 1;
  }
}

/* exports */

export { ObjectRepository };

export type { ObjectRepositoryContract };
