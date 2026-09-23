import type { ChannelCredentials, ServiceError } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeUnavailableError } from '@/errors/internode.errors';
import type {
  DataNodeStatusClient as GrpcStatusClient,
  CheckDataNodeHealthResponse
} from '@/gen/proto/status/v1/status';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';

import type { DataNodeEndpoint } from '../data-node.domain';

/* fixtures */

const endpoint: DataNodeEndpoint = {
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs'
};

const healthResponse: CheckDataNodeHealthResponse = {
  health_snapshot: {
    status: 0,
    database_ok: true,
    storage_ok: true,
    storage_total_bytes: '1000',
    storage_free_bytes: '400',
    message: 'healthy'
  }
};

/* mocks */

type HealthCallback = (error: ServiceError | null, response: CheckDataNodeHealthResponse) => void;

type GrpcStatusClientMock = {
  checkDataNodeHealth: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: HealthCallback) => void
  >;
  close: jest.Mock<() => void>;
};

const grpcStatusClientConstructorMock = jest.fn();

let DataNodeGrpcClient: typeof import('../data-node.grpc-client').DataNodeGrpcClient;

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

describe('DataNodeGrpcClient', () => {
  let createdClients: GrpcStatusClientMock[];

  beforeAll(async () => {
    jest.doMock('@/gen/proto/status/v1/status', () => {
      const actual = jest.requireActual<typeof import('@/gen/proto/status/v1/status')>('@/gen/proto/status/v1/status');

      return {
        ...actual,
        DataNodeStatusClient: grpcStatusClientConstructorMock
      };
    });

    ({ DataNodeGrpcClient } = await import('../data-node.grpc-client'));
  });

  afterAll(() => {
    jest.dontMock('@/gen/proto/status/v1/status');
  });

  beforeEach(() => {
    createdClients = [];
    grpcStatusClientConstructorMock.mockReset();

    grpcStatusClientConstructorMock.mockImplementation(() => {
      const client: GrpcStatusClientMock = {
        checkDataNodeHealth: jest.fn((_request, _metadata, _options, callback: HealthCallback) => {
          callback(null, healthResponse);
        }),
        close: jest.fn()
      };

      createdClients.push(client);

      return client as unknown as InstanceType<typeof GrpcStatusClient>;
    });
  });

  test('checks health and maps the gRPC snapshot', async () => {
    const { credentials, provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    await expect(client.checkDataNodeHealth(endpoint)).resolves.toEqual({
      status: 'healthy',
      databaseOk: true,
      storageOk: true,
      storageTotalBytes: 1_000n,
      storageFreeBytes: 400n,
      message: 'healthy'
    });
    expect(grpcStatusClientConstructorMock).toHaveBeenCalledWith('data-node.internal:50051', credentials);
    expect(createdClients[0].checkDataNodeHealth).toHaveBeenCalledTimes(1);
  });

  test('reuses a client for repeated checks of the same endpoint', async () => {
    const { provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    await client.checkDataNodeHealth(endpoint);
    await client.checkDataNodeHealth(endpoint);

    expect(grpcStatusClientConstructorMock).toHaveBeenCalledTimes(1);
    expect(provider.get).toHaveBeenCalledTimes(1);
    expect(createdClients[0].checkDataNodeHealth).toHaveBeenCalledTimes(2);
  });

  test('creates separate clients for different endpoints', async () => {
    const { provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    await client.checkDataNodeHealth(endpoint);
    await client.checkDataNodeHealth({
      ...endpoint,
      hostname: 'other-data-node.internal'
    });

    expect(grpcStatusClientConstructorMock).toHaveBeenCalledTimes(2);
    expect(createdClients).toHaveLength(2);
  });

  test('rejects a response without a health snapshot', async () => {
    const { provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    grpcStatusClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcStatusClientMock = {
        checkDataNodeHealth: jest.fn((_request, _metadata, _options, callback: HealthCallback) => {
          callback(null, {
            health_snapshot: undefined
          });
        }),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcStatusClient>;
    });

    await expect(client.checkDataNodeHealth(endpoint)).rejects.toBeInstanceOf(GenericInternalServerError);
  });

  test('maps gRPC failures to internode application errors', async () => {
    const { provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    const grpcError = {
      name: 'Error',
      message: '14 UNAVAILABLE: data node unavailable',
      code: status.UNAVAILABLE,
      details: 'data node unavailable',
      metadata: new Metadata()
    } as ServiceError;

    grpcStatusClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcStatusClientMock = {
        checkDataNodeHealth: jest.fn((_request, _metadata, _options, callback: HealthCallback) => {
          callback(grpcError, healthResponse);
        }),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcStatusClient>;
    });

    await expect(client.checkDataNodeHealth(endpoint)).rejects.toBeInstanceOf(InternodeUnavailableError);
  });

  test('closes cached clients and creates a new one for a later request', async () => {
    const { provider } = createCredentialsMock();
    const client = new DataNodeGrpcClient(provider);

    await client.checkDataNodeHealth(endpoint);
    client.close();

    expect(createdClients[0].close).toHaveBeenCalledTimes(1);

    await client.checkDataNodeHealth(endpoint);

    expect(grpcStatusClientConstructorMock).toHaveBeenCalledTimes(2);
  });
});
