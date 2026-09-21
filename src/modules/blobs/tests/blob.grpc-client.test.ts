import { Buffer } from 'node:buffer';

import type { ChannelCredentials, ServiceError } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { InternodeUnavailableError } from '@/errors/internode.errors';
import type {
  BlobClient as GrpcBlobClientConstructor,
  DeleteBlobResponse,
  GetBlobResponse,
  HeadBlobResponse,
  PutBlobResponse,
  VerifyBlobResponse
} from '@/gen/proto/blob/v1/blob';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from '../blob.application';
import { BLOB_CHECKSUM_ALGORITHM } from '../blob.domain';
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

const getResponse: GetBlobResponse = {
  ...metadataResponse,
  bytes
};

const grpcConfig: GrpcClientConfig = {
  maxMessageSizeBytes: 12_000
};

/* mocks */

type UnaryCallback<TResponse> = (error: ServiceError | null, response: TResponse) => void;

type GrpcBlobClientMock = {
  headBlob: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: UnaryCallback<HeadBlobResponse>) => void
  >;
  getBlob: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: UnaryCallback<GetBlobResponse>) => void
  >;
  verifyBlob: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: UnaryCallback<VerifyBlobResponse>) => void
  >;
  putBlob: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: UnaryCallback<PutBlobResponse>) => void
  >;
  deleteBlob: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: UnaryCallback<DeleteBlobResponse>) => void
  >;
  close: jest.Mock<() => void>;
};

const grpcBlobClientConstructorMock = jest.fn();

let BlobGrpcClient: typeof import('../blob.grpc-client').BlobGrpcClient;

const createCredentialsMock = () => {
  const credentials = {} as ChannelCredentials;
  const provider: jest.Mocked<GrpcClientCredentialsContract> = {
    get: jest.fn<GrpcClientCredentialsContract['get']>().mockReturnValue(credentials)
  };

  return {
    credentials,
    provider
  };
};

/* tests */

describe('BlobGrpcClient', () => {
  let createdClients: GrpcBlobClientMock[];

  beforeAll(async () => {
    jest.doMock('@/gen/proto/blob/v1/blob', () => {
      const actual = jest.requireActual<typeof import('@/gen/proto/blob/v1/blob')>('@/gen/proto/blob/v1/blob');

      return {
        ...actual,
        BlobClient: grpcBlobClientConstructorMock
      };
    });

    ({ BlobGrpcClient } = await import('../blob.grpc-client'));
  });

  afterAll(() => {
    jest.dontMock('@/gen/proto/blob/v1/blob');
  });

  beforeEach(() => {
    createdClients = [];
    grpcBlobClientConstructorMock.mockReset();

    grpcBlobClientConstructorMock.mockImplementation(() => {
      const client: GrpcBlobClientMock = {
        headBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<HeadBlobResponse>) => {
          callback(null, metadataResponse);
        }),
        getBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<GetBlobResponse>) => {
          callback(null, getResponse);
        }),
        verifyBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<VerifyBlobResponse>) => {
          callback(null, metadataResponse);
        }),
        putBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<PutBlobResponse>) => {
          callback(null, metadataResponse);
        }),
        deleteBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<DeleteBlobResponse>) => {
          callback(null, {});
        }),
        close: jest.fn()
      };

      createdClients.push(client);

      return client as unknown as InstanceType<typeof GrpcBlobClientConstructor>;
    });
  });

  test('heads a blob and maps its metadata', async () => {
    const { credentials, provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    const result = await client.headBlob(blobInput);

    expect(result).toEqual({
      blobId,
      sizeBytes: BigInt(bytes.length),
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue
    });
    expect(grpcBlobClientConstructorMock).toHaveBeenCalledWith('data-node.internal:50051', credentials, {
      'grpc.max_receive_message_length': grpcConfig.maxMessageSizeBytes,
      'grpc.max_send_message_length': grpcConfig.maxMessageSizeBytes
    });
    expect(createdClients[0].headBlob).toHaveBeenCalledWith(
      { blob_id: blobId },
      expect.any(Metadata),
      expect.any(Object),
      expect.any(Function)
    );
  });

  test('gets a blob and maps its bytes', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await expect(client.getBlob(blobInput)).resolves.toEqual(blobWithBytesInput.blob);
    expect(createdClients[0].getBlob.mock.calls[0][0]).toEqual({ blob_id: blobId });
  });

  test('verifies a blob and maps its metadata', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await expect(client.verifyBlob(blobInput)).resolves.toEqual({
      blobId,
      sizeBytes: BigInt(bytes.length),
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue
    });
    expect(createdClients[0].verifyBlob.mock.calls[0][0]).toEqual({ blob_id: blobId });
  });

  test('puts a blob using its metadata and bytes', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await expect(client.putBlob(blobWithBytesInput)).resolves.toEqual({
      blobId,
      sizeBytes: BigInt(bytes.length),
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue
    });
    expect(createdClients[0].putBlob.mock.calls[0][0]).toEqual({
      blob_id: blobId,
      size_bytes: bytes.length.toString(),
      checksum_algorithm: BLOB_CHECKSUM_ALGORITHM,
      checksum_value: checksumValue,
      bytes
    });
  });

  test('deletes a blob by id', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await expect(client.deleteBlob(blobInput)).resolves.toBeUndefined();
    expect(createdClients[0].deleteBlob.mock.calls[0][0]).toEqual({ blob_id: blobId });
  });

  test('reuses a client for repeated operations against the same endpoint', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await client.headBlob(blobInput);
    await client.getBlob(blobInput);

    expect(grpcBlobClientConstructorMock).toHaveBeenCalledTimes(1);
    expect(provider.get).toHaveBeenCalledTimes(1);
  });

  test('creates separate clients for different endpoints', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await client.headBlob(blobInput);
    await client.headBlob({
      ...blobInput,
      dataNodeEndpoint: {
        ...dataNodeEndpoint,
        hostname: 'other-data-node.internal'
      }
    });

    expect(grpcBlobClientConstructorMock).toHaveBeenCalledTimes(2);
  });

  test('maps gRPC failures to internode application errors', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);
    const grpcError = {
      name: 'Error',
      message: '14 UNAVAILABLE: data node unavailable',
      code: status.UNAVAILABLE,
      details: 'data node unavailable',
      metadata: new Metadata()
    } as ServiceError;

    grpcBlobClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcBlobClientMock = {
        headBlob: jest.fn((_request, _metadata, _options, callback: UnaryCallback<HeadBlobResponse>) => {
          callback(grpcError, metadataResponse);
        }),
        getBlob: jest.fn(),
        verifyBlob: jest.fn(),
        putBlob: jest.fn(),
        deleteBlob: jest.fn(),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcBlobClientConstructor>;
    });

    await expect(client.headBlob(blobInput)).rejects.toBeInstanceOf(InternodeUnavailableError);
  });

  test('closes cached clients and creates a new one for a later request', async () => {
    const { provider } = createCredentialsMock();
    const client = new BlobGrpcClient(grpcConfig, provider);

    await client.headBlob(blobInput);
    client.close();

    expect(createdClients[0].close).toHaveBeenCalledTimes(1);

    await client.headBlob(blobInput);

    expect(grpcBlobClientConstructorMock).toHaveBeenCalledTimes(2);
  });
});
