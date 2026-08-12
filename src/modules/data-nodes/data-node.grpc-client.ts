import { credentials as grpcCredentials, Metadata } from '@grpc/grpc-js';

import { GenericInternalServerError } from '@/errors/application.errors';
import { mapGrpcErrorToApplicationError } from '@/transports/grpc/mappers/error.mappers';
import { DEFAULT_GRPC_DEADLINE_MS } from '@/transports/grpc/client/grpc-client.constants';
import {
  CheckHealthDataNodeClient as GrpcHealthClient,
  CheckHealthDataNodeRequest,
  type CheckHealthDataNodeResponse
} from '@/gen/proto/health/v1/health';

import type { CheckHealthDataNodeClientInput } from './data-node.application';
import type { DataNodeHealthSnapshot } from './data-node.domain';
import { mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot } from './data-node.mappers';

/**/

type DataNodeGrpcClientContract = {
  checkHealthDataNode(input: CheckHealthDataNodeClientInput): Promise<DataNodeHealthSnapshot>;
  close(): void;
};

/**/

class DataNodeGrpcClient implements DataNodeGrpcClientContract {
  private readonly clients = new Map<string, GrpcHealthClient>();

  close(): void {
    for (const client of this.clients.values()) {
      client.close();
    }

    this.clients.clear();
  }

  private getClient(input: CheckHealthDataNodeClientInput): GrpcHealthClient {
    const key = `${input.scheme}://${input.hostname}:${input.port}`;

    const existingClient = this.clients.get(key);

    if (existingClient) {
      return existingClient;
    }

    const credentials = input.scheme === 'grpcs' ? grpcCredentials.createSsl() : grpcCredentials.createInsecure();

    const client = new GrpcHealthClient(`${input.hostname}:${input.port}`, credentials);

    this.clients.set(key, client);

    return client;
  }

  async checkHealthDataNode(input: CheckHealthDataNodeClientInput): Promise<DataNodeHealthSnapshot> {
    const client = this.getClient(input);

    const response = await new Promise<CheckHealthDataNodeResponse>((resolve, reject) => {
      client.checkHealthDataNode(
        CheckHealthDataNodeRequest.create(),
        new Metadata(),
        {
          deadline: new Date(Date.now() + DEFAULT_GRPC_DEADLINE_MS)
        },
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
      throw new GenericInternalServerError('Missing health snapshot in check health response');
    }

    return mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(response.health_snapshot);
  }
}

/**/

export { DataNodeGrpcClient };

export type { DataNodeGrpcClientContract };
