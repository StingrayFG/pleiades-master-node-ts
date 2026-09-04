import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { BlobConfig } from './blob.config';
import { BlobGrpcClient } from './blob.grpc-client';
import { BlobService } from './blob.service';

/* contract */

type BlobModuleDependencies = {
  blobConfig: BlobConfig;
  grpcClientCredentials: GrpcClientCredentialsContract;
  grpcConfig: GrpcClientConfig;
};

type BlobModule = {
  grpcClient: BlobGrpcClient;
  service: BlobService;
};

/* module */

const createBlobModule = ({ blobConfig, grpcClientCredentials, grpcConfig }: BlobModuleDependencies): BlobModule => {
  const grpcClient = new BlobGrpcClient(grpcConfig, grpcClientCredentials);

  const service = new BlobService(grpcClient, blobConfig);

  return {
    grpcClient,
    service
  };
};

/* exports */

export { createBlobModule };
export type { BlobModule, BlobModuleDependencies };
