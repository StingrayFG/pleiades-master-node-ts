import type { Bucket as PrismaBucket } from '@prisma/client';

import { wrapMapping } from '@/mappers/mapping';

import { bucketSchema, type Bucket } from './bucket.domain';
import type { BucketResponse, BucketsResponse } from './bucket.http-contracts';

export const mapPrismaBucketToDomainBucket = (bucket: PrismaBucket): Bucket => {
  return wrapMapping('Failed to map Prisma bucket to domain bucket', () => {
    return bucketSchema.parse({
      id: bucket.id,
      name: bucket.name,
      state: bucket.state,
      createdAt: bucket.created_at,
      updatedAt: bucket.updated_at
    });
  });
};

export const mapDomainBucketToHttpBucketResponse = (bucket: Bucket): BucketResponse => {
  return wrapMapping('Failed to map domain bucket to HTTP bucket', () => {
    return {
      name: bucket.name,
      state: bucket.state,
      createdAt: bucket.createdAt.toISOString(),
      updatedAt: bucket.updatedAt.toISOString()
    };
  });
};

export const mapDomainBucketsToHttpBucketsResponse = (buckets: Bucket[]): BucketsResponse => {
  return wrapMapping('Failed to map domain buckets to HTTP buckets', () => {
    return buckets.map((bucket) => mapDomainBucketToHttpBucketResponse(bucket));
  });
};
