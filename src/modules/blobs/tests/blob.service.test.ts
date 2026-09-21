import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeDataLossError } from '@/errors/internode.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from '../blob.application';
import type { BlobConfig } from '../blob.config';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from '../blob.domain';
import type { BlobGrpcClientContract } from '../blob.grpc-client';
import { calculateBlobChecksum } from '../blob.processors';
import { BlobService } from '../blob.service';
import { deleteBlobTaskDefinition, ensureBlobExistsTaskDefinition } from '../blob.tasks';

/* fixtures */

const blobId = '00000000-0000-4000-8000-000000000001';
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

const blobInput: DataNodeBlobInput = {
  blobId,
  dataNodeEndpoint
};

const blobWithBytesInput: DataNodeBlobWithBytesInput = {
  blob,
  dataNodeEndpoint
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

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    getTaskById: jest.fn<TaskServiceContract['getTaskById']>(),
    registerHandler: jest.fn<TaskServiceContract['registerHandler']>(),
    submitTask: jest.fn<TaskServiceContract['submitTask']>(),
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>(),
    executeTaskByDefinitionAndTargets: jest.fn<TaskServiceContract['executeTaskByDefinitionAndTargets']>()
  } as unknown as jest.Mocked<TaskServiceContract>;
};

/* tests */

describe('BlobService', () => {
  let grpcClient: jest.Mocked<BlobGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: BlobService;

  beforeEach(() => {
    grpcClient = createBlobGrpcClientMock();
    taskService = createTaskServiceMock();
    service = new BlobService(grpcClient, blobConfig, taskService);
  });

  test('gets and validates blob metadata', async () => {
    await expect(service.getBlobMetadata(blobInput)).resolves.toBe(blobMetadata);
    expect(grpcClient.headBlob).toHaveBeenCalledWith(blobInput);
  });

  test('rejects metadata returned for a different blob', async () => {
    grpcClient.headBlob.mockResolvedValue({
      ...blobMetadata,
      blobId: '00000000-0000-4000-8000-000000000099'
    });

    await expect(service.getBlobMetadata(blobInput)).rejects.toBeInstanceOf(InternodeDataLossError);
  });

  test('gets and validates blob bytes', async () => {
    await expect(service.getBlob(blobInput)).resolves.toBe(blob);
    expect(grpcClient.getBlob).toHaveBeenCalledWith(blobInput);
  });

  test('rejects inconsistent blob bytes returned by the data node', async () => {
    grpcClient.getBlob.mockResolvedValue({
      ...blob,
      bytes: Buffer.from('corrupt')
    });

    await expect(service.getBlob(blobInput)).rejects.toBeInstanceOf(InternodeDataLossError);
  });

  test('rejects blob bytes returned for a different blob', async () => {
    grpcClient.getBlob.mockResolvedValue({
      ...blob,
      blobId: '00000000-0000-4000-8000-000000000099'
    });

    await expect(service.getBlob(blobInput)).rejects.toBeInstanceOf(InternodeDataLossError);
  });

  test('verifies a blob and validates the returned identity', async () => {
    await expect(service.verifyBlob(blobInput)).resolves.toBe(blobMetadata);
    expect(grpcClient.verifyBlob).toHaveBeenCalledWith(blobInput);
  });

  test('rejects verification metadata returned for a different blob', async () => {
    grpcClient.verifyBlob.mockResolvedValue({
      ...blobMetadata,
      blobId: '00000000-0000-4000-8000-000000000099'
    });

    await expect(service.verifyBlob(blobInput)).rejects.toBeInstanceOf(InternodeDataLossError);
  });

  test('submits a valid ensure-blob task', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(blobMetadata);

    await expect(service.ensureBlobExists(blobWithBytesInput)).resolves.toBe(blobMetadata);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(ensureBlobExistsTaskDefinition, {
      blob,
      dataNodeEndpoint
    });
  });

  test('rejects an ensure-blob task result with inconsistent metadata', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue({
      ...blobMetadata,
      checksumValue: 'f'.repeat(64)
    });

    await expect(service.ensureBlobExists(blobWithBytesInput)).rejects.toBeInstanceOf(InternodeDataLossError);
  });

  test('rejects an invalid supplied blob before task submission', async () => {
    const invalidInput: DataNodeBlobWithBytesInput = {
      ...blobWithBytesInput,
      blob: {
        ...blob,
        sizeBytes: blob.sizeBytes + 1n
      }
    };

    await expect(service.ensureBlobExists(invalidInput)).rejects.toBeInstanceOf(GenericInternalServerError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('rejects an oversized supplied blob before task submission', async () => {
    const oversizedBytes = Buffer.alloc(Number(blobConfig.maxSizeBytes + 1n));
    const oversizedInput: DataNodeBlobWithBytesInput = {
      blob: {
        blobId,

        sizeBytes: BigInt(oversizedBytes.length),
        checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
        checksumValue: calculateBlobChecksum(oversizedBytes),

        bytes: oversizedBytes
      },
      dataNodeEndpoint
    };

    await expect(service.ensureBlobExists(oversizedInput)).rejects.toBeInstanceOf(GenericInternalServerError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('submits a delete-blob task', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(undefined);

    await expect(service.deleteBlob(blobInput)).resolves.toBeUndefined();
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(deleteBlobTaskDefinition, {
      blobId,
      dataNodeEndpoint
    });
  });
});
