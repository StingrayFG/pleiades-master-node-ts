import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';
import type { GetBlobResponse, HeadBlobResponse } from '@/gen/proto/blob/v1/blob';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from '../blob.application';
import { BLOB_CHECKSUM_ALGORITHM } from '../blob.domain';
import {
  mapDeleteBlobClientInputToGrpcDeleteBlobRequest,
  mapGetBlobClientInputToGrpcGetBlobRequest,
  mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes,
  mapGrpcHeadBlobResponseToDomainBlobMetadata,
  mapGrpcPutBlobResponseToDomainBlobMetadata,
  mapGrpcVerifyBlobResponseToDomainBlobMetadata,
  mapHeadBlobClientInputToGrpcHeadBlobRequest,
  mapPutBlobClientInputToGrpcPutBlobRequest,
  mapVerifyBlobClientInputToGrpcVerifyBlobRequest
} from '../blob.mappers';
import { calculateBlobChecksum } from '../blob.processors';

/* fixtures */

const blobId = '00000000-0000-4000-8000-000000000001';
const bytes = Buffer.from('blob data');
const checksumValue = calculateBlobChecksum(bytes);

const dataNodeEndpoint = {
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs' as const
};

const blobInput: DataNodeBlobInput = {
  blobId,
  dataNodeEndpoint
};

const blobWithBytesInput: DataNodeBlobWithBytesInput = {
  blob: {
    blobId,

    sizeBytes: BigInt(bytes.length),
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue,

    bytes
  },
  dataNodeEndpoint
};

const metadataResponse: HeadBlobResponse = {
  blob_id: blobId,
  size_bytes: bytes.length.toString(),
  checksum_algorithm: BLOB_CHECKSUM_ALGORITHM,
  checksum_value: checksumValue
};

/* tests */

describe('blob mappers', () => {
  test.each([
    ['head', mapGrpcHeadBlobResponseToDomainBlobMetadata],
    ['verify', mapGrpcVerifyBlobResponseToDomainBlobMetadata],
    ['put', mapGrpcPutBlobResponseToDomainBlobMetadata]
  ] as const)('maps a gRPC %s response to blob metadata', (_operation, map) => {
    expect(map(metadataResponse)).toEqual({
      blobId,

      sizeBytes: BigInt(bytes.length),
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue
    });
  });

  test('maps a gRPC get response to blob metadata with bytes', () => {
    const response: GetBlobResponse = {
      ...metadataResponse,
      bytes
    };

    expect(mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes(response)).toEqual(blobWithBytesInput.blob);
  });

  test.each([
    ['head', mapGrpcHeadBlobResponseToDomainBlobMetadata],
    ['verify', mapGrpcVerifyBlobResponseToDomainBlobMetadata],
    ['put', mapGrpcPutBlobResponseToDomainBlobMetadata]
  ] as const)('wraps an invalid gRPC %s response in a mapper error', (_operation, map) => {
    expect(() =>
      map({
        ...metadataResponse,
        size_bytes: '-1'
      })
    ).toThrow(GenericMapperError);
  });

  test('wraps invalid gRPC get bytes metadata in a mapper error', () => {
    expect(() =>
      mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes({
        ...metadataResponse,
        size_bytes: 'invalid',
        bytes
      })
    ).toThrow(GenericMapperError);
  });

  test('maps head, get, verify, and delete inputs to blob-id requests', () => {
    expect(mapHeadBlobClientInputToGrpcHeadBlobRequest(blobInput)).toEqual({ blob_id: blobId });
    expect(mapGetBlobClientInputToGrpcGetBlobRequest(blobInput)).toEqual({ blob_id: blobId });
    expect(mapVerifyBlobClientInputToGrpcVerifyBlobRequest(blobInput)).toEqual({ blob_id: blobId });
    expect(mapDeleteBlobClientInputToGrpcDeleteBlobRequest(blobInput)).toEqual({ blob_id: blobId });
  });

  test('maps a put input to a gRPC request', () => {
    expect(mapPutBlobClientInputToGrpcPutBlobRequest(blobWithBytesInput)).toEqual({
      blob_id: blobId,

      size_bytes: bytes.length.toString(),
      checksum_algorithm: BLOB_CHECKSUM_ALGORITHM,
      checksum_value: checksumValue,

      bytes
    });
  });
});
