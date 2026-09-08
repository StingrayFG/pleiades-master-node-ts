import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';
import { GenericAbortedError } from '@/errors/application.errors';
import type { UserId } from '@/modules/users/user.domain';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import { mapPrismaBucketToDomainBucket } from './bucket.mappers';

/* contract */

type BucketRepositoryContract = {
  listAll(userId: UserId): Promise<Bucket[]>;
  findByName(userId: UserId, name: BucketName): Promise<Bucket | null>;
  findOrCreate(userId: UserId, name: BucketName): Promise<EnsureBucketExistsResult>;
  delete(userId: UserId, name: BucketName): Promise<Bucket>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

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

  async findOrCreate(userId: UserId, bucketName: BucketName): Promise<EnsureBucketExistsResult> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.create({
        data: {
          name: bucketName,

          user_id: userId,

          state: 'active'
        }
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw mapPrismaError(err, errorMap) ?? err;
      }

      const existingBucket = await this.findByName(userId, bucketName);

      if (!existingBucket) {
        throw new GenericAbortedError('Bucket resolution was aborted by a concurrent change', { cause: err });
      }

      return {
        bucket: existingBucket,
        status: 'existing'
      };
    }

    return {
      bucket: mapPrismaBucketToDomainBucket(bucket),
      status: 'created'
    };
  }

  async delete(userId: UserId, bucketName: BucketName): Promise<Bucket> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.delete({
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

    return mapPrismaBucketToDomainBucket(bucket);
  }
}

/* exports */

export { BucketRepository };
export type { BucketRepositoryContract };
