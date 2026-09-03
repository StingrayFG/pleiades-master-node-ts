import type { PrismaClient } from '@prisma/client';

import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';

import { DataNodeGrpcClient } from './data-node.grpc-client';
import { DataNodeGrpcController } from './data-node.grpc-controller';
import { DataNodeRepository } from './data-node.repository';
import { DataNodeService } from './data-node.service';
import { DataNodeLifecycleHandler } from './lifecycle/data-node.lifecycle-handler';

/* contract */

type DataNodeModuleDependencies = {
  prisma: PrismaClient;
  grpcClientCredentials: GrpcClientCredentialsContract;
};

type DataNodeModule = {
  repository: DataNodeRepository;
  grpcClient: DataNodeGrpcClient;
  service: DataNodeService;
  lifecycleHandler: DataNodeLifecycleHandler;
  controller: DataNodeGrpcController;
};

/* module */

const createDataNodeModule = ({ prisma, grpcClientCredentials }: DataNodeModuleDependencies): DataNodeModule => {
  const repository = new DataNodeRepository(prisma);

  const grpcClient = new DataNodeGrpcClient(grpcClientCredentials);

  const service = new DataNodeService(repository, grpcClient);

  const lifecycleHandler = new DataNodeLifecycleHandler(repository, grpcClient);

  const controller = new DataNodeGrpcController(service);

  return {
    repository,
    grpcClient,
    service,
    lifecycleHandler,
    controller
  };
};

/* exports */

export { createDataNodeModule };
export type { DataNodeModule, DataNodeModuleDependencies };
