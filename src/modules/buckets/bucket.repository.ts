import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAlreadyExistsError, GenericNotFoundError } from '@/errors/application.errors';
import type { UserId } from '@/modules/users/user.domain';

import type { CreateBucketRepositoryInput } from './bucket.application';
import type { Bucket, BucketId, BucketName } from './bucket.domain';
import { mapPrismaBucketToDomainBucket } from './bucket.mappers';

/* contract */

type BucketRepositoryContract = {
  listAll(userId: UserId): Promise<Bucket[]>;
  findByName(userId: UserId, name: BucketName): Promise<Bucket | null>;
  create(input: CreateBucketRepositoryInput): Promise<Bucket>;
  deleteById(id: BucketId): Promise<Bucket | null>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {
  errors: {
    uniqueConstraintViolation: {
      createError: (message, cause) => new GenericAlreadyExistsError(message, { cause }),
      message: 'Bucket already exists'
    },
    requiredRecordNotFound: {
      createError: (message, cause) => new GenericNotFoundError(message, { cause }),
      message: 'Bucket not found'
    }
  }
};

class BucketRepository implements BucketRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(userId: UserId): Promise<Bucket[]> {
    let buckets;

    try {
      buckets = await this.prisma.bucket.findMany({
        where: {
          user_id: userId
        },
        orderBy: {
          name: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return buckets.map(mapPrismaBucketToDomainBucket);
  }

  async findByName(userId: UserId, bucketName: BucketName): Promise<Bucket | null> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.findUnique({
        where: {
          user_id_name: {
            user_id: userId,
            name: bucketName
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return bucket ? mapPrismaBucketToDomainBucket(bucket) : null;
  }

  async create(input: CreateBucketRepositoryInput): Promise<Bucket> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.create({
        data: {
          id: input.id,
          name: input.name,

          user_id: input.userId,

          state: input.state,

          revision: input.revision
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaBucketToDomainBucket(bucket);
  }

  async deleteById(id: BucketId): Promise<Bucket | null> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.delete({
        where: {
          id
        }
      });
    } catch (err) {
      const mappedError = mapPrismaError(err, errorMap) ?? err;

      if (mappedError instanceof GenericNotFoundError) {
        return null;
      }

      throw mappedError;
    }

    return mapPrismaBucketToDomainBucket(bucket);
  }
}

/* exports */

export { BucketRepository };
export type { BucketRepositoryContract };
