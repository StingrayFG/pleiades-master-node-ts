import { describe, expect, test } from '@jest/globals';

import { InternodeDataLossError } from '@/errors/internode.errors';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata } from '@/modules/blobs/blob.domain';

import type { Part } from '../object-version-part.domain';
import { verifyPartBlob } from '../object-version-part.verifiers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const part: Part = {
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

const blob: BlobMetadata = {
  blobId: part.blobId,
  sizeBytes: part.sizeBytes,
  checksumAlgorithm: part.checksumAlgorithm,
  checksumValue: part.checksumValue
};

/* tests */

describe('verifyPartBlob', () => {
  test('accepts metadata matching the part', () => {
    expect(() => verifyPartBlob(part, blob)).not.toThrow();
  });

  test.each([
    { ...blob, blobId: '00000000-0000-4000-8000-000000000099' },
    { ...blob, sizeBytes: 13n },
    { ...blob, checksumValue: 'b'.repeat(64) }
  ])('rejects inconsistent blob metadata', (invalidBlob) => {
    expect(() => verifyPartBlob(part, invalidBlob)).toThrow(InternodeDataLossError);
  });
});
