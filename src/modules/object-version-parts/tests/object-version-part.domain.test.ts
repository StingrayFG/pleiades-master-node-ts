import { describe, expect, test } from '@jest/globals';

import { BLOB_CHECKSUM_ALGORITHM } from '@/modules/blobs/blob.domain';

import { partReplicaSchema, partSchema } from '../object-version-part.domain';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

/* tests */

describe('object version part domain schemas', () => {
  test('parses part and replica entities', () => {
    const part = {
      objectId: '00000000-0000-4000-8000-000000000001',
      version: 1,
      partNumber: 1,
      blobId: '00000000-0000-4000-8000-000000000002',
      placementGroup: 4,
      sizeBytes: 12n,
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue: 'a'.repeat(64),
      createdAt: now
    };
    const replica = {
      blobId: part.blobId,
      dataNodeId: 'data-node-test',
      state: 'committed' as const,
      createdAt: now,
      lastVerifiedAt: now,
      stateChangedAt: now,
      updatedAt: now
    };

    expect(partSchema.parse(part)).toEqual(part);
    expect(partReplicaSchema.parse(replica)).toEqual(replica);
  });

  test('rejects invalid part numbering, placement, and replica state', () => {
    const part = {
      objectId: '00000000-0000-4000-8000-000000000001',
      version: 1,
      partNumber: 0,
      blobId: '00000000-0000-4000-8000-000000000002',
      placementGroup: -1,
      sizeBytes: 12n,
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue: 'a'.repeat(64),
      createdAt: now
    };

    expect(partSchema.safeParse(part).success).toBe(false);
    expect(
      partReplicaSchema.safeParse({
        blobId: part.blobId,
        dataNodeId: 'data-node-test',
        state: 'unknown',
        createdAt: now,
        lastVerifiedAt: null,
        stateChangedAt: now,
        updatedAt: now
      }).success
    ).toBe(false);
  });
});
