import { describe, expect, test } from '@jest/globals';

import { bucketNameSchema, bucketSchema } from '../bucket.domain';

/* fixtures */

const validBucket = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'test-bucket',

  userId: '00000000-0000-4000-8000-000000000001',

  state: 'active' as const,

  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),

  revision: 0n
};

/* tests */

describe('bucket domain schemas', () => {
  test('accepts a valid bucket', () => {
    expect(bucketSchema.parse(validBucket)).toEqual(validBucket);
  });

  test.each([
    'ab',
    'a'.repeat(64),
    'Test-bucket',
    '-test-bucket',
    'test-bucket-',
    'test_bucket',
    'test/bucket',
    'test\\bucket',
    '../test-bucket',
    'test.bucket',
    'test bucket',
    'test\nbucket',
    'test\u0000bucket',
    'test-bucket?admin=true',
    'test-bucket#fragment',
    'test%2Fbucket',
    'tést-bucket'
  ])('rejects invalid bucket name %j', (name) => {
    expect(bucketNameSchema.safeParse(name).success).toBe(false);
  });

  test('rejects a negative revision', () => {
    const result = bucketSchema.safeParse({
      ...validBucket,
      revision: -1n
    });

    expect(result.success).toBe(false);
  });

  test('rejects an invalid owner id', () => {
    const result = bucketSchema.safeParse({
      ...validBucket,
      userId: 'not-a-uuid'
    });

    expect(result.success).toBe(false);
  });
});
