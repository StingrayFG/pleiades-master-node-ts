import type { Bucket as PrismaBucket } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { Bucket } from '../bucket.domain';
import {
  mapDomainBucketsToHttpBucketsResponse,
  mapDomainBucketToHttpBucketResponse,
  mapPrismaBucketToDomainBucket
} from '../bucket.mappers';

/* fixtures */

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

const prismaBucket: PrismaBucket = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'test-bucket',

  user_id: '00000000-0000-4000-8000-000000000001',

  state: 'active',

  created_at: createdAt,
  updated_at: updatedAt,

  revision: 2n
};

const domainBucket: Bucket = {
  id: prismaBucket.id,
  name: prismaBucket.name,

  userId: prismaBucket.user_id,

  state: prismaBucket.state,

  createdAt,
  updatedAt,

  revision: prismaBucket.revision
};

/* tests */

describe('bucket mappers', () => {
  test('maps a Prisma bucket to the domain entity', () => {
    expect(mapPrismaBucketToDomainBucket(prismaBucket)).toEqual(domainBucket);
  });

  test('wraps invalid Prisma data in a mapper error', () => {
    const invalidBucket = {
      ...prismaBucket,
      name: 'Invalid-Bucket-Name'
    };

    expect(() => mapPrismaBucketToDomainBucket(invalidBucket)).toThrow(GenericMapperError);
  });

  test('maps a domain bucket to its public HTTP representation', () => {
    expect(mapDomainBucketToHttpBucketResponse(domainBucket)).toEqual({
      name: 'test-bucket',
      state: 'active',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString()
    });
  });

  test('maps a bucket collection to public HTTP representations', () => {
    expect(mapDomainBucketsToHttpBucketsResponse([domainBucket])).toEqual([
      {
        name: 'test-bucket',
        state: 'active',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString()
      }
    ]);
  });
});
