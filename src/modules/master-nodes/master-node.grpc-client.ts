import type { Buffer } from 'node:buffer';

import { Metadata } from '@grpc/grpc-js';

import {
  MasterClient as GrpcMasterClient,
  type FetchTaskEntriesResponse,
  type FetchTaskPayloadResponse
} from '@/gen/proto/master/v1/master';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToInternodeApplicationError } from '@/transports/grpc/mappers/error.mappers';

import type { FetchTaskEntriesClientInput, FetchTaskEntriesInternodeResult, FetchTaskPayloadClientInput } from './master-node.application';
import type { MasterNodeEndpoint } from './master-node.domain';
import { mapGrpcTaskEntryToInternodeTaskEntry } from './master-node.mappers';

/* contract */

type MasterNodeGrpcClientContract = {
  fetchTaskEntries(input: FetchTaskEntriesClientInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadClientInput): Promise<Buffer>;
  close(): void;
};

/* client */

class MasterNodeGrpcClient implements MasterNodeGrpcClientContract {
  private readonly clientsByEndpoint = new Map<string, GrpcMasterClient>();

  constructor(
    private readonly grpcConfig: GrpcClientConfig,
    private readonly grpcClientCredentials: GrpcClientCredentialsContract
  ) {}

  close(): void {
    for (const client of this.clientsByEndpoint.values()) {
      client.close();
    }

    this.clientsByEndpoint.clear();
  }

  async fetchTaskEntries(input: FetchTaskEntriesClientInput): Promise<FetchTaskEntriesInternodeResult> {
    const client = this.getClient(input.masterNodeEndpoint);

    const response = await new Promise<FetchTaskEntriesResponse>((resolve, reject) => {
      client.fetchTaskEntries(
        {
          after_sequence: input.afterSequence.toString(),
          limit: input.limit
        },
        new Metadata(),
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

    return {
      epoch: BigInt(response.epoch),
      lastCommittedSequence: BigInt(response.last_committed_sequence),
      entries: response.entries.map(mapGrpcTaskEntryToInternodeTaskEntry)
    };
  }

  async fetchTaskPayload(input: FetchTaskPayloadClientInput): Promise<Buffer> {
    const client = this.getClient(input.masterNodeEndpoint);

    const response = await new Promise<FetchTaskPayloadResponse>((resolve, reject) => {
      client.fetchTaskPayload(
        {
          payload_id: input.payloadId
        },
        new Metadata(),
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

    return response.payload;
  }

  /* private */

  private getClient(endpoint: MasterNodeEndpoint): GrpcMasterClient {
    const endpointKey = `${endpoint.scheme}://${endpoint.hostname}:${endpoint.port}`;

    const existingClient = this.clientsByEndpoint.get(endpointKey);

    if (existingClient) {
      return existingClient;
    }

    const credentials = this.grpcClientCredentials.get();
    const maxMessageSizeBytes = this.grpcConfig.maxMessageSizeBytes;

    const client = new GrpcMasterClient(`${endpoint.hostname}:${endpoint.port}`, credentials, {
      'grpc.max_receive_message_length': maxMessageSizeBytes,
      'grpc.max_send_message_length': maxMessageSizeBytes
    });

    this.clientsByEndpoint.set(endpointKey, client);

    return client;
  }
}

/* exports */

export { MasterNodeGrpcClient };
export type { FetchTaskEntriesClientInput, FetchTaskPayloadClientInput, MasterNodeGrpcClientContract };
