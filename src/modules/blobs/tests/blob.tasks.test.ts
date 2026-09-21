import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';

import { BLOB_CHECKSUM_ALGORITHM } from '../blob.domain';
import { calculateBlobChecksum } from '../blob.processors';
import {
  blobTaskSchema,
  deleteBlobTaskDefinition,
  ensureBlobExistsTaskDefinition,
  type DeleteBlobTask,
  type EnsureBlobExistsTaskData
} from '../blob.tasks';

/* fixtures */

const taskId = '00000000-0000-4000-8000-000000000001';
const blobId = '00000000-0000-4000-8000-000000000002';
const bytes = Buffer.from('blob data');

const dataNodeEndpoint = {
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs' as const
};

const ensureData: EnsureBlobExistsTaskData = {
  blob: {
    blobId,

    sizeBytes: BigInt(bytes.length),
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue: calculateBlobChecksum(bytes),

    bytes
  },
  dataNodeEndpoint
};

const taskBase = {
  id: taskId,

  originMasterNodeId: 'master-node-test',
  epoch: 1n,
  sequence: 2n,

  state: 'pending' as const,
  revision: 0n
};

/* tests */

describe('blob task definitions', () => {
  test('dehydrates blob bytes into a separate payload', () => {
    expect(ensureBlobExistsTaskDefinition.dehydrateData(ensureData)).toEqual({
      data: {
        blob: {
          blobId,

          sizeBytes: BigInt(bytes.length),
          checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
          checksumValue: calculateBlobChecksum(bytes)
        },
        dataNodeEndpoint
      },
      payload: bytes
    });
  });

  test('hydrates persisted blob metadata with its payload', () => {
    const dehydrated = ensureBlobExistsTaskDefinition.dehydrateData(ensureData);

    expect(ensureBlobExistsTaskDefinition.hydrateData(dehydrated.data, dehydrated.payload)).toEqual(ensureData);
  });

  test('encodes and decodes persisted blob byte counts', () => {
    const dehydrated = ensureBlobExistsTaskDefinition.dehydrateData(ensureData);
    const encoded = z.encode(ensureBlobExistsTaskDefinition.persistedDataSchema, dehydrated.data);

    expect(encoded).toEqual({
      blob: {
        blobId,

        sizeBytes: bytes.length.toString(),
        checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
        checksumValue: calculateBlobChecksum(bytes)
      },
      dataNodeEndpoint
    });
    expect(z.decode(ensureBlobExistsTaskDefinition.persistedDataSchema, encoded)).toEqual(dehydrated.data);
  });

  test('parses ensure and delete blob task variants', () => {
    const ensureTask = {
      ...taskBase,
      type: 'blob.ensure-exists' as const,
      data: {
        ...ensureData,
        blob: {
          ...ensureData.blob,
          sizeBytes: ensureData.blob.sizeBytes.toString(),
          bytes: ensureData.blob.bytes.toString('base64')
        }
      },
      executionScope: 'cluster' as const
    };

    const deleteTask: DeleteBlobTask = {
      ...taskBase,
      type: 'blob.delete',
      data: {
        blobId,
        dataNodeEndpoint
      },
      executionScope: 'cluster'
    };

    expect(blobTaskSchema.parse(ensureTask)).toEqual({
      ...ensureTask,
      data: ensureData
    });
    expect(blobTaskSchema.parse(deleteTask)).toEqual(deleteTask);
  });

  test('uses cluster execution for both blob task definitions', () => {
    expect(ensureBlobExistsTaskDefinition.executionScope).toBe('cluster');
    expect(deleteBlobTaskDefinition.executionScope).toBe('cluster');
  });
});
