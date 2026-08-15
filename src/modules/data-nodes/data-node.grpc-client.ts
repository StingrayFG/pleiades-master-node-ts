import { credentials as grpcCredentials, Metadata } from '@grpc/grpc-js';

import { GenericInternalServerError } from '@/errors/application.errors';
import {
  CheckDataNodeHealthRequest,
  DataNodeStatusClient as GrpcStatusClient,
  type CheckDataNodeHealthResponse
} from '@/gen/proto/status/v1/status';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToApplicationError } from '@/transports/grpc/mappers/error.mappers';

import type { DataNodeEndpoint, DataNodeHealthSnapshot } from './data-node.domain';
import { mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot } from './data-node.mappers';

/**/

type DataNodeGrpcClientContract = {
  checkDataNodeHealth(input: DataNodeEndpoint): Promise<DataNodeHealthSnapshot>;
  close(): void;
};

/**/

class DataNodeGrpcClient implements DataNodeGrpcClientContract {
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

    const credentials = endpoint.scheme === 'grpcs' ? grpcCredentials.createSsl() : grpcCredentials.createInsecure();

    const client = new GrpcStatusClient(`${endpoint.hostname}:${endpoint.port}`, credentials);

    this.clients.set(key, client);

    return client;
  }

  async checkDataNodeHealth(input: DataNodeEndpoint): Promise<DataNodeHealthSnapshot> {
    const client = this.getClient(input);

    const response = await new Promise<CheckDataNodeHealthResponse>((resolve, reject) => {
      client.checkDataNodeHealth(
        CheckDataNodeHealthRequest.create(),
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToApplicationError(err));
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

/**/

export { DataNodeGrpcClient };

export type { DataNodeGrpcClientContract };
