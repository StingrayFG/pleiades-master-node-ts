import { describe, expect, test } from '@jest/globals';

import { GenericDataLossError } from '@/errors/application.errors';
import { BLOB_CHECKSUM_ALGORITHM, type BlobChecksumValue } from '@/modules/blobs/blob.domain';
import type { Part } from '@/modules/object-version-parts/object-version-part.domain';

import type { ObjectVersion } from '../object.domain';
import { verifyObjectVersionParts } from '../object.verifiers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const checksumValue = 'a'.repeat(64) as BlobChecksumValue;

const objectVersion: ObjectVersion = {
  objectId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  state: 'committed',
  totalSizeBytes: 5n,
  contentType: 'application/octet-stream',
  createdAt: now,
  committedAt: now,
  updatedAt: now
};

const parts: Part[] = [
  {
    objectId: objectVersion.objectId,
    version: objectVersion.version,
    partNumber: 1,
    blobId: '00000000-0000-4000-8000-000000000002',
    placementGroup: 1,
    sizeBytes: 3n,
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue,
    createdAt: now
  },
  {
    objectId: objectVersion.objectId,
    version: objectVersion.version,
    partNumber: 2,
    blobId: '00000000-0000-4000-8000-000000000003',
    placementGroup: 2,
    sizeBytes: 2n,
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue,
    createdAt: now
  }
];

/* tests */

describe('verifyObjectVersionParts', () => {
  test('accepts contiguous parts matching the object version size', () => {
    expect(() => verifyObjectVersionParts(objectVersion, parts)).not.toThrow();
  });

  test.each([
    [{ ...parts[0], objectId: '00000000-0000-4000-8000-000000000099' }, parts[1]],
    [{ ...parts[0], version: 2 }, parts[1]],
    [{ ...parts[0], partNumber: 2 }, parts[1]],
    [parts[1], parts[0]]
  ])('rejects parts with inconsistent identity or ordering', (...invalidParts) => {
    expect(() => verifyObjectVersionParts(objectVersion, invalidParts)).toThrow(GenericDataLossError);
  });

  test('rejects a part set whose combined size does not match the object version', () => {
    expect(() => verifyObjectVersionParts({ ...objectVersion, totalSizeBytes: 6n }, parts)).toThrow(
      GenericDataLossError
    );
  });
});
