import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';

import { mapPrismaBucketToDomainBucket } from './bucket.mappers';
import type { Bucket, BucketName } from './bucket.domain';
import type { EnsureBucketResult } from './bucket.application';

/**/

type BucketRepositoryContract = {
  findByName(name: BucketName): Promise<Bucket | null>;
  createIfNotExists(name: BucketName): Promise<EnsureBucketResult>;
};

/**/

const errorMap: PrismaErrorMapperOverrides = {};

class BucketRepository implements BucketRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async findByName(bucketName: BucketName): Promise<Bucket | null> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.findUnique({
        where: {
          name: bucketName
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return bucket ? mapPrismaBucketToDomainBucket(bucket) : null;
  }

  async createIfNotExists(bucketName: BucketName): Promise<EnsureBucketResult> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.create({
        data: {
          name: bucketName
        }
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw mapPrismaError(err, errorMap) ?? err;
      }

      const existingBucket = await this.findByName(bucketName);

      if (!existingBucket) {
        throw mapPrismaError(err, errorMap) ?? err;
      }

      return {
        bucket: existingBucket,
        created: false
      };
    }

    return {
      bucket: mapPrismaBucketToDomainBucket(bucket),
      created: true
    };
  }
}

/**/

export { BucketRepository };

export type { BucketRepositoryContract };
