import { describe, expect, test } from '@jest/globals';

import { objectSchema, objectVersionSchema } from '../object.domain';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

/* tests */

describe('object domain schemas', () => {
  test('parses object and object version entities', () => {
    const object = {
      id: '00000000-0000-4000-8000-000000000001',
      key: 'path/to/object',
      bucketId: '00000000-0000-4000-8000-000000000002',
      currentVersion: 2,
      lastAllocatedVersion: 2,
      createdAt: now,
      updatedAt: now
    };
    const objectVersion = {
      objectId: object.id,
      version: 2,
      state: 'committed' as const,
      totalSizeBytes: 12n,
      contentType: 'application/octet-stream',
      createdAt: now,
      committedAt: now,
      updatedAt: now
    };

    expect(objectSchema.parse(object)).toEqual(object);
    expect(objectVersionSchema.parse(objectVersion)).toEqual(objectVersion);
  });

  test('allows objects without a current version', () => {
    expect(
      objectSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
        key: 'object',
        bucketId: '00000000-0000-4000-8000-000000000002',
        currentVersion: null,
        lastAllocatedVersion: 0,
        createdAt: now,
        updatedAt: now
      }).success
    ).toBe(true);
  });

  test('rejects invalid version counters and metadata', () => {
    const object = {
      id: '00000000-0000-4000-8000-000000000001',
      key: 'object',
      bucketId: '00000000-0000-4000-8000-000000000002',
      currentVersion: 0,
      lastAllocatedVersion: -1,
      createdAt: now,
      updatedAt: now
    };
    const objectVersion = {
      objectId: object.id,
      version: 0,
      state: 'committed',
      totalSizeBytes: -1n,
      contentType: '',
      createdAt: now,
      committedAt: now,
      updatedAt: now
    };

    expect(objectSchema.safeParse(object).success).toBe(false);
    expect(objectVersionSchema.safeParse(objectVersion).success).toBe(false);
  });
});
