import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import { mapPrismaBucketToDomainBucket } from './bucket.mappers';

/**/

type BucketRepositoryContract = {
  findAll(): Promise<Bucket[]>;
  findByName(name: BucketName): Promise<Bucket | null>;
  findOrCreate(name: BucketName): Promise<EnsureBucketExistsResult>;
  delete(name: BucketName): Promise<Bucket>;
};

/**/

const errorMap: PrismaErrorMapperOverrides = {};

class BucketRepository implements BucketRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Bucket[]> {
    let buckets;

    try {
      buckets = await this.prisma.bucket.findMany({
        orderBy: {
          name: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return buckets.map(mapPrismaBucketToDomainBucket);
  }

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

  async findOrCreate(bucketName: BucketName): Promise<EnsureBucketExistsResult> {
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
        status: 'existing'
      };
    }

    return {
      bucket: mapPrismaBucketToDomainBucket(bucket),
      status: 'created'
    };
  }

  async delete(bucketName: BucketName): Promise<Bucket> {
    let bucket;

    try {
      bucket = await this.prisma.bucket.delete({
        where: {
          name: bucketName
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaBucketToDomainBucket(bucket);
  }
}

/**/

export { BucketRepository };

export type { BucketRepositoryContract };
