import type { Bucket as PrismaBucket } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { bucketSchema, type Bucket } from './bucket.domain';
import type { BucketResponse, BucketsResponse } from './bucket.http-contracts';

/* domain -> http */

export const mapDomainBucketToHttpBucketResponse = (bucket: Bucket): BucketResponse => {
  return withMapperError('Failed to map domain bucket to HTTP bucket', () => {
    return {
      name: bucket.name,
      state: bucket.state,
      createdAt: bucket.createdAt.toISOString(),
      updatedAt: bucket.updatedAt.toISOString()
    };
  });
};

export const mapDomainBucketsToHttpBucketsResponse = (buckets: Bucket[]): BucketsResponse => {
  return withMapperError('Failed to map domain buckets to HTTP buckets', () => {
    return buckets.map((bucket) => mapDomainBucketToHttpBucketResponse(bucket));
  });
};

/* prisma -> domain */

export const mapPrismaBucketToDomainBucket = (bucket: PrismaBucket): Bucket => {
  return withMapperError('Failed to map Prisma bucket to domain bucket', () => {
    return bucketSchema.parse({
      id: bucket.id,
      name: bucket.name,
      state: bucket.state,
      createdAt: bucket.created_at,
      updatedAt: bucket.updated_at
    });
  });
};
