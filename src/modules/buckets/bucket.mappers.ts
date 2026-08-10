import type { Bucket as PrismaBucket } from '@prisma/client';
import { bucketSchema, type Bucket } from './bucket.domain';
import type { BucketResponse } from './bucket.http-contracts';

export const mapPrismaBucketToDomainBucket = (bucket: PrismaBucket): Bucket =>
  bucketSchema.parse({
    id: bucket.id,
    name: bucket.name,
    state: bucket.state,
    createdAt: bucket.created_at,
    updatedAt: bucket.updated_at
  });

export const mapDomainBucketToHttpBucketResponse = (bucket: Bucket): BucketResponse => ({
  name: bucket.name,
  state: bucket.state,
  createdAt: bucket.createdAt.toISOString(),
  updatedAt: bucket.updatedAt.toISOString()
});
