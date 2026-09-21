import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import {
  InternodeAbortedError,
  InternodeAlreadyExistsError,
  InternodeDataLossError,
  InternodeNotFoundError,
  InternodeUnavailableError
} from '@/errors/internode.errors';

import type { BlobConfig } from '../blob.config';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from '../blob.domain';
import type { BlobGrpcClientContract } from '../blob.grpc-client';
import { calculateBlobChecksum } from '../blob.processors';
import { BlobTaskHandler } from '../blob.task-handler';
import type { DeleteBlobTask, EnsureBlobExistsTask } from '../blob.tasks';

/* fixtures */

const taskId = '00000000-0000-4000-8000-000000000001';
const blobId = '00000000-0000-4000-8000-000000000002';
const bytes = Buffer.from('blob data');

const blob: BlobMetadataWithBytes = {
  blobId,

  sizeBytes: BigInt(bytes.length),
  checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
  checksumValue: calculateBlobChecksum(bytes),

  bytes
};

const blobMetadata: BlobMetadata = {
  blobId: blob.blobId,

  sizeBytes: blob.sizeBytes,
  checksumAlgorithm: blob.checksumAlgorithm,
  checksumValue: blob.checksumValue
};

const dataNodeEndpoint = {
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs' as const
};

const taskBase = {
  id: taskId,

  originMasterNodeId: 'master-node-test',
  epoch: 1n,
  sequence: 2n,

  state: 'pending' as const,
  revision: 0n
};

const ensureBlobExistsTask: EnsureBlobExistsTask = {
  ...taskBase,
  type: 'blob.ensure-exists',
  data: {
    blob,
    dataNodeEndpoint
  },
  executionScope: 'cluster'
};

const deleteBlobTask: DeleteBlobTask = {
  ...taskBase,
  type: 'blob.delete',
  data: {
    blobId,
    dataNodeEndpoint
  },
  executionScope: 'cluster'
};

const blobConfig: BlobConfig = {
  maxSizeBytes: 1_000n,
  maxPutAttempts: 3
};

/* mocks */

const createBlobGrpcClientMock = (): jest.Mocked<BlobGrpcClientContract> => {
  const grpcClient = {
    headBlob: jest.fn<BlobGrpcClientContract['headBlob']>(),
    getBlob: jest.fn<BlobGrpcClientContract['getBlob']>(),
    verifyBlob: jest.fn<BlobGrpcClientContract['verifyBlob']>(),
    putBlob: jest.fn<BlobGrpcClientContract['putBlob']>(),
    deleteBlob: jest.fn<BlobGrpcClientContract['deleteBlob']>(),
    close: jest.fn<BlobGrpcClientContract['close']>()
  };

  grpcClient.headBlob.mockResolvedValue(blobMetadata);
  grpcClient.getBlob.mockResolvedValue(blob);
  grpcClient.verifyBlob.mockResolvedValue(blobMetadata);
  grpcClient.putBlob.mockResolvedValue(blobMetadata);
  grpcClient.deleteBlob.mockResolvedValue();

  return grpcClient;
};

/* tests */

describe('BlobTaskHandler', () => {
  let grpcClient: jest.Mocked<BlobGrpcClientContract>;
  let handler: BlobTaskHandler;

  beforeEach(() => {
    grpcClient = createBlobGrpcClientMock();
    handler = new BlobTaskHandler(grpcClient, blobConfig);
  });

  describe('ensureBlobExists', () => {
    test('puts a valid supplied blob and returns the confirmed metadata', async () => {
      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).resolves.toBe(blobMetadata);
      expect(grpcClient.putBlob).toHaveBeenCalledWith({
        blob,
        dataNodeEndpoint
      });
      expect(grpcClient.headBlob).not.toHaveBeenCalled();
    });

    test('rejects an invalid supplied blob before making an RPC', async () => {
      const invalidTask: EnsureBlobExistsTask = {
        ...ensureBlobExistsTask,
        data: {
          ...ensureBlobExistsTask.data,
          blob: {
            ...blob,
            sizeBytes: blob.sizeBytes + 1n
          }
        }
      };

      await expect(handler.ensureBlobExists(invalidTask)).rejects.toBeInstanceOf(GenericInternalServerError);
      expect(grpcClient.putBlob).not.toHaveBeenCalled();
    });

    test('rejects inconsistent metadata returned after a put', async () => {
      grpcClient.putBlob.mockResolvedValue({
        ...blobMetadata,
        checksumValue: 'f'.repeat(64)
      });

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).rejects.toBeInstanceOf(InternodeDataLossError);
    });

    test('retries aborted puts and returns a later successful result', async () => {
      grpcClient.putBlob
        .mockRejectedValueOnce(new InternodeAbortedError())
        .mockRejectedValueOnce(new InternodeAbortedError())
        .mockResolvedValueOnce(blobMetadata);

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).resolves.toBe(blobMetadata);
      expect(grpcClient.putBlob).toHaveBeenCalledTimes(3);
    });

    test('fails after the configured number of aborted put attempts', async () => {
      grpcClient.putBlob.mockRejectedValue(new InternodeAbortedError());

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).rejects.toBeInstanceOf(GenericInternalServerError);
      expect(grpcClient.putBlob).toHaveBeenCalledTimes(blobConfig.maxPutAttempts);
      expect(grpcClient.headBlob).not.toHaveBeenCalled();
    });

    test('preserves non-aborted put errors without retrying', async () => {
      const error = new InternodeUnavailableError('Data node unavailable');

      grpcClient.putBlob.mockRejectedValue(error);

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).rejects.toBe(error);
      expect(grpcClient.putBlob).toHaveBeenCalledTimes(1);
      expect(grpcClient.headBlob).not.toHaveBeenCalled();
    });

    test('returns matching existing metadata when a replay encounters a duplicate', async () => {
      grpcClient.putBlob.mockRejectedValue(new InternodeAlreadyExistsError());

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).resolves.toBe(blobMetadata);
      expect(grpcClient.headBlob).toHaveBeenCalledWith({
        blobId,
        dataNodeEndpoint
      });
    });

    test('rejects a replay when the existing blob metadata differs', async () => {
      grpcClient.putBlob.mockRejectedValue(new InternodeAlreadyExistsError());
      grpcClient.headBlob.mockResolvedValue({
        ...blobMetadata,
        sizeBytes: blobMetadata.sizeBytes + 1n
      });

      await expect(handler.ensureBlobExists(ensureBlobExistsTask)).rejects.toBeInstanceOf(InternodeDataLossError);
    });
  });

  describe('deleteBlob', () => {
    test('deletes the blob described by the task', async () => {
      await expect(handler.deleteBlob(deleteBlobTask)).resolves.toBeUndefined();
      expect(grpcClient.deleteBlob).toHaveBeenCalledWith({
        blobId,
        dataNodeEndpoint
      });
    });

    test('treats an already missing blob as a successful replay', async () => {
      grpcClient.deleteBlob.mockRejectedValue(new InternodeNotFoundError());

      await expect(handler.deleteBlob(deleteBlobTask)).resolves.toBeUndefined();
    });

    test('preserves non-not-found delete failures', async () => {
      const error = new InternodeUnavailableError('Data node unavailable');

      grpcClient.deleteBlob.mockRejectedValue(error);

      await expect(handler.deleteBlob(deleteBlobTask)).rejects.toBe(error);
    });
  });
});
