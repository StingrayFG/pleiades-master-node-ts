import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeDataLossError } from '@/errors/internode.errors';

import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from '../blob.domain';
import { calculateBlobChecksum } from '../blob.processors';
import {
  verifyBlobIntegrity,
  verifyBlobMetadataIdentity,
  verifyBlobMetadataMatch,
  verifySuppliedBlobIntegrity
} from '../blob.verifiers';

/* fixtures */

const blobId = '00000000-0000-4000-8000-000000000001';
const otherBlobId = '00000000-0000-4000-8000-000000000002';
const bytes = Buffer.from('blob data');

const blob: BlobMetadataWithBytes = {
  blobId,

  sizeBytes: BigInt(bytes.length),
  checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
  checksumValue: calculateBlobChecksum(bytes),

  bytes
};

const metadata: BlobMetadata = {
  blobId: blob.blobId,

  sizeBytes: blob.sizeBytes,
  checksumAlgorithm: blob.checksumAlgorithm,
  checksumValue: blob.checksumValue
};

/* tests */

describe('blob verifiers', () => {
  test('accepts metadata for the expected blob', () => {
    expect(() => verifyBlobMetadataIdentity(blobId, metadata)).not.toThrow();
  });

  test('rejects metadata for a different blob', () => {
    expect(() => verifyBlobMetadataIdentity(otherBlobId, metadata)).toThrow(InternodeDataLossError);
  });

  test('accepts matching blob metadata', () => {
    expect(() => verifyBlobMetadataMatch(metadata, { ...metadata })).not.toThrow();
  });

  test.each([
    ['blob id', { blobId: otherBlobId }],
    ['size', { sizeBytes: metadata.sizeBytes + 1n }],
    ['checksum value', { checksumValue: 'f'.repeat(64) }]
  ])('rejects metadata with a different %s', (_field, override) => {
    expect(() =>
      verifyBlobMetadataMatch(metadata, {
        ...metadata,
        ...override
      })
    ).toThrow(InternodeDataLossError);
  });

  test('accepts fetched bytes with consistent metadata', () => {
    expect(() => verifyBlobIntegrity(blobId, blob)).not.toThrow();
  });

  test.each([
    ['blob id', { blobId: otherBlobId }],
    ['declared size', { sizeBytes: blob.sizeBytes + 1n }],
    ['checksum value', { checksumValue: 'f'.repeat(64) }],
    ['bytes', { bytes: Buffer.from('different data') }]
  ])('rejects fetched blob data with inconsistent %s', (_field, override) => {
    expect(() =>
      verifyBlobIntegrity(blobId, {
        ...blob,
        ...override
      })
    ).toThrow(InternodeDataLossError);
  });

  test('accepts a consistent supplied blob within the configured size limit', () => {
    expect(() => verifySuppliedBlobIntegrity(blob, blob.sizeBytes)).not.toThrow();
  });

  test('rejects a supplied blob over the configured size limit', () => {
    expect(() => verifySuppliedBlobIntegrity(blob, blob.sizeBytes - 1n)).toThrow(GenericInternalServerError);
  });

  test.each([
    ['declared size', { sizeBytes: blob.sizeBytes + 1n }],
    ['checksum value', { checksumValue: 'f'.repeat(64) }],
    ['bytes', { bytes: Buffer.from('different data') }]
  ])('rejects supplied blob data with inconsistent %s', (_field, override) => {
    expect(() =>
      verifySuppliedBlobIntegrity(
        {
          ...blob,
          ...override
        },
        1_000n
      )
    ).toThrow(GenericInternalServerError);
  });
});
