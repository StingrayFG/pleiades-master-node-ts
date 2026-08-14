import { credentials as grpcCredentials, Metadata } from '@grpc/grpc-js';

import { GenericInternalServerError } from '@/errors/application.errors';
import type { CheckHealthDataNodeClientInput } from '@/modules/data-nodes/data-node.application';
import type { DataNodeHealthSnapshot } from '@/modules/data-nodes/data-node.domain';
import { mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot } from '@/modules/data-nodes/data-node.mappers';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToApplicationError } from '@/transports/grpc/mappers/error.mappers';
import {
  CheckDataNodeHealthRequest,
  DataNodeStatusClient as GrpcStatusClient,
  type CheckDataNodeHealthResponse
} from '@/gen/proto/status/v1/status';

/**/

type DataNodeGrpcClientContract = {
  checkDataNodeHealth(input: CheckHealthDataNodeClientInput): Promise<DataNodeHealthSnapshot>;
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

  private getClient(input: CheckHealthDataNodeClientInput): GrpcStatusClient {
    const key = `${input.scheme}://${input.hostname}:${input.port}`;

    const existingClient = this.clients.get(key);

    if (existingClient) {
      return existingClient;
    }

    const credentials = input.scheme === 'grpcs' ? grpcCredentials.createSsl() : grpcCredentials.createInsecure();

    const client = new GrpcStatusClient(`${input.hostname}:${input.port}`, credentials);

    this.clients.set(key, client);

    return client;
  }

  async checkDataNodeHealth(input: CheckHealthDataNodeClientInput): Promise<DataNodeHealthSnapshot> {
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
