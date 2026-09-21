import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { dataNodeBlobInputSchema, dataNodeBlobWithBytesInputSchema } from '../blob.application';
import {
  BLOB_CHECKSUM_ALGORITHM,
  blobChecksumValueSchema,
  blobMetadataSchema,
  blobMetadataWithBytesSchema,
  dataNodeBlobStateSchema
} from '../blob.domain';
import { internodeBlobErrorDetailsSchema } from '../blob.internode';
import { calculateBlobChecksum } from '../blob.processors';

/* fixtures */

const blobId = '00000000-0000-4000-8000-000000000001';
const bytes = Buffer.from('blob data');

const blobMetadata = {
  blobId,

  sizeBytes: BigInt(bytes.length),
  checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
  checksumValue: calculateBlobChecksum(bytes)
};

const dataNodeEndpoint = {
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs' as const
};

/* tests */

describe('blob domain schemas', () => {
  test('accepts valid blob metadata', () => {
    expect(blobMetadataSchema.parse(blobMetadata)).toEqual(blobMetadata);
  });

  test('accepts valid blob metadata with bytes', () => {
    const blob = {
      ...blobMetadata,
      bytes
    };

    expect(blobMetadataWithBytesSchema.parse(blob)).toEqual(blob);
  });

  test.each(['', 'abc', 'g'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects invalid checksum value %j',
    (checksumValue) => {
      expect(blobChecksumValueSchema.safeParse(checksumValue).success).toBe(false);
    }
  );

  test('rejects negative blob sizes', () => {
    expect(
      blobMetadataSchema.safeParse({
        ...blobMetadata,
        sizeBytes: -1n
      }).success
    ).toBe(false);
  });

  test('rejects unsupported blob states', () => {
    expect(dataNodeBlobStateSchema.safeParse('active').success).toBe(false);
  });

  test('validates data-node blob inputs', () => {
    expect(
      dataNodeBlobInputSchema.parse({
        blobId,
        dataNodeEndpoint
      })
    ).toEqual({
      blobId,
      dataNodeEndpoint
    });

    expect(
      dataNodeBlobWithBytesInputSchema.parse({
        blob: {
          ...blobMetadata,
          bytes
        },
        dataNodeEndpoint
      })
    ).toEqual({
      blob: {
        ...blobMetadata,
        bytes
      },
      dataNodeEndpoint
    });
  });

  test('validates internode blob error details with an optional state', () => {
    expect(
      internodeBlobErrorDetailsSchema.parse({
        blobId,
        blobState: 'missing'
      })
    ).toEqual({
      blobId,
      blobState: 'missing'
    });

    expect(internodeBlobErrorDetailsSchema.parse({ blobId })).toEqual({ blobId });
  });
});
