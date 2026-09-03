import { GenericInternalServerError } from '@/errors/application.errors';
import {
  CheckDataNodeHealthRequest,
  DataNodeStatusClient as GrpcStatusClient,
  type CheckDataNodeHealthResponse
} from '@/gen/proto/status/v1/status';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import { createAuthenticatedGrpcMetadata } from '@/transports/grpc/client/grpc-client.metadata';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToInternodeApplicationError } from '@/transports/grpc/mappers/error.mappers';

import type { DataNodeEndpoint, DataNodeHealthSnapshot } from './data-node.domain';
import { mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot } from './data-node.mappers';

/* contract */

type DataNodeGrpcClientContract = {
  checkDataNodeHealth(input: DataNodeEndpoint): Promise<DataNodeHealthSnapshot>;
  close(): void;
};

/* client */

class DataNodeGrpcClient implements DataNodeGrpcClientContract {
  constructor(private readonly grpcClientCredentials: GrpcClientCredentialsContract) {}

  private readonly clients = new Map<string, GrpcStatusClient>();

  close(): void {
    for (const client of this.clients.values()) {
      client.close();
    }

    this.clients.clear();
  }

  private getClient(endpoint: DataNodeEndpoint): GrpcStatusClient {
    const key = `${endpoint.scheme}://${endpoint.hostname}:${endpoint.port}`;

    const existingClient = this.clients.get(key);

    if (existingClient) {
      return existingClient;
    }

    const credentials = this.grpcClientCredentials.get();

    const client = new GrpcStatusClient(`${endpoint.hostname}:${endpoint.port}`, credentials);

    this.clients.set(key, client);

    return client;
  }

  async checkDataNodeHealth(input: DataNodeEndpoint): Promise<DataNodeHealthSnapshot> {
    const client = this.getClient(input);

    const response = await new Promise<CheckDataNodeHealthResponse>((resolve, reject) => {
      client.checkDataNodeHealth(
        CheckDataNodeHealthRequest.create(),
        createAuthenticatedGrpcMetadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    if (!response.health_snapshot) {
      throw new GenericInternalServerError('Missing health snapshot in check data node health response');
    }

    return mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(response.health_snapshot);
  }
}

/* exports */

export { DataNodeGrpcClient };
export type { DataNodeGrpcClientContract };
