import type { TaskServiceContract } from '@/modules/tasks/task.service';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { BlobConfig } from './blob.config';
import { BlobGrpcClient } from './blob.grpc-client';
import { BlobService } from './blob.service';
import { BlobTaskHandler } from './blob.task-handler';
import { deleteBlobTaskDefinition, ensureBlobExistsTaskDefinition } from './blob.tasks';

/* contract */

type BlobModuleDependencies = {
  blobConfig: BlobConfig;
  taskService: TaskServiceContract;
  grpcClientCredentials: GrpcClientCredentialsContract;
  grpcConfig: GrpcClientConfig;
};

type BlobModule = {
  grpcClient: BlobGrpcClient;
  service: BlobService;
};

/* module */

const createBlobModule = ({ blobConfig, taskService, grpcClientCredentials, grpcConfig }: BlobModuleDependencies): BlobModule => {
  const grpcClient = new BlobGrpcClient(grpcConfig, grpcClientCredentials);

  const taskHandler = new BlobTaskHandler(grpcClient, blobConfig);

  taskService.registerHandler(ensureBlobExistsTaskDefinition, (task) => taskHandler.ensureBlobExists(task));
  taskService.registerHandler(deleteBlobTaskDefinition, (task) => taskHandler.deleteBlob(task));

  const service = new BlobService(grpcClient, blobConfig, taskService);

  return {
    grpcClient,
    service
  };
};

/* exports */

export { createBlobModule };
export type { BlobModule, BlobModuleDependencies };
