import { credentials as grpcCredentials } from '@grpc/grpc-js';

import {
  BlobClient as GrpcBlobClient,
  type GetBlobResponse,
  type HeadBlobResponse,
  type PutBlobResponse,
  type VerifyBlobResponse
} from '@/gen/proto/blob/v1/blob';
import { GRPC_BLOB_MESSAGE_SIZE_LIMIT_BYTES } from '@/transports/grpc/client/grpc-client.constants';
import { createAuthenticatedGrpcMetadata } from '@/transports/grpc/client/grpc-client.metadata';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToInternodeApplicationError } from '@/transports/grpc/mappers/error.mappers';

import type { DataNodeEndpoint } from '@/modules/data-nodes/data-node.domain';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from './blob.application';
import type { BlobMetadata, BlobMetadataWithBytes } from './blob.domain';
import {
  mapDeleteBlobClientInputToGrpcDeleteBlobRequest,
  mapGetBlobClientInputToGrpcGetBlobRequest,
  mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes,
  mapGrpcHeadBlobResponseToDomainBlobMetadata,
  mapGrpcPutBlobResponseToDomainBlobMetadata,
  mapGrpcVerifyBlobResponseToDomainBlobMetadata,
  mapHeadBlobClientInputToGrpcHeadBlobRequest,
  mapPutBlobClientInputToGrpcPutBlobRequest,
  mapVerifyBlobClientInputToGrpcVerifyBlobRequest
} from './blob.mappers';

/* contract */

type BlobGrpcClientContract = {
  headBlob(input: DataNodeBlobInput): Promise<BlobMetadata>;
  getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes>;
  verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata>;
  putBlob(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata>;
  deleteBlob(input: DataNodeBlobInput): Promise<void>;
  close(): void;
};

/* client */

class BlobGrpcClient implements BlobGrpcClientContract {
  private readonly clientsByEndpoint = new Map<string, GrpcBlobClient>();

  /* public */

  close(): void {
    for (const client of this.clientsByEndpoint.values()) {
      client.close();
    }

    this.clientsByEndpoint.clear();
  }

  async headBlob(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const client = this.getClient(input.dataNodeEndpoint);

    const request = mapHeadBlobClientInputToGrpcHeadBlobRequest(input);

    const response = await new Promise<HeadBlobResponse>((resolve, reject) => {
      client.headBlob(request, createAuthenticatedGrpcMetadata(), createDefaultGrpcCallOptions(), (err, response) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve(response);
      });
    });

    return mapGrpcHeadBlobResponseToDomainBlobMetadata(response);
  }

  async getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes> {
    const client = this.getClient(input.dataNodeEndpoint);

    const request = mapGetBlobClientInputToGrpcGetBlobRequest(input);

    const response = await new Promise<GetBlobResponse>((resolve, reject) => {
      client.getBlob(request, createAuthenticatedGrpcMetadata(), createDefaultGrpcCallOptions(), (err, response) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve(response);
      });
    });

    return mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes(response);
  }

  async verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const client = this.getClient(input.dataNodeEndpoint);

    const request = mapVerifyBlobClientInputToGrpcVerifyBlobRequest(input);

    const response = await new Promise<VerifyBlobResponse>((resolve, reject) => {
      client.verifyBlob(request, createAuthenticatedGrpcMetadata(), createDefaultGrpcCallOptions(), (err, response) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve(response);
      });
    });

    return mapGrpcVerifyBlobResponseToDomainBlobMetadata(response);
  }

  async putBlob(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    const client = this.getClient(input.dataNodeEndpoint);

    const request = mapPutBlobClientInputToGrpcPutBlobRequest(input);

    const response = await new Promise<PutBlobResponse>((resolve, reject) => {
      client.putBlob(request, createAuthenticatedGrpcMetadata(), createDefaultGrpcCallOptions(), (err, response) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve(response);
      });
    });

    return mapGrpcPutBlobResponseToDomainBlobMetadata(response);
  }

  async deleteBlob(input: DataNodeBlobInput): Promise<void> {
    const client = this.getClient(input.dataNodeEndpoint);

    const request = mapDeleteBlobClientInputToGrpcDeleteBlobRequest(input);

    await new Promise<void>((resolve, reject) => {
      client.deleteBlob(request, createAuthenticatedGrpcMetadata(), createDefaultGrpcCallOptions(), (err) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve();
      });
    });
  }

  /* private */

  private getClient(endpoint: DataNodeEndpoint): GrpcBlobClient {
    const endpointKey = `${endpoint.scheme}://${endpoint.hostname}:${endpoint.port}`;

    const existingClient = this.clientsByEndpoint.get(endpointKey);

    if (existingClient) {
      return existingClient;
    }

    const credentials = endpoint.scheme === 'grpcs' ? grpcCredentials.createSsl() : grpcCredentials.createInsecure();

    const client = new GrpcBlobClient(`${endpoint.hostname}:${endpoint.port}`, credentials, {
      'grpc.max_receive_message_length': GRPC_BLOB_MESSAGE_SIZE_LIMIT_BYTES,
      'grpc.max_send_message_length': GRPC_BLOB_MESSAGE_SIZE_LIMIT_BYTES
    });

    this.clientsByEndpoint.set(endpointKey, client);

    return client;
  }
}

/* exports */

export { BlobGrpcClient };
export type { BlobGrpcClientContract };
