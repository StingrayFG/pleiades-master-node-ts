import type { PrismaClient } from '@prisma/client';

import { DataNodeGrpcClient } from './data-node.grpc-client';
import { DataNodeGrpcController } from './data-node.grpc-controller';
import { DataNodeRepository } from './data-node.repository';
import { DataNodeService } from './data-node.service';

/* contract */

type DataNodeModuleDependencies = {
  prisma: PrismaClient;
};

type DataNodeModule = {
  repository: DataNodeRepository;
  grpcClient: DataNodeGrpcClient;
  service: DataNodeService;
  controller: DataNodeGrpcController;
};

/* module */

const createDataNodeModule = ({ prisma }: DataNodeModuleDependencies): DataNodeModule => {
  const repository = new DataNodeRepository(prisma);

  const grpcClient = new DataNodeGrpcClient();

  const service = new DataNodeService(repository, grpcClient);

  const controller = new DataNodeGrpcController(service);

  return {
    repository,
    grpcClient,
    service,
    controller
  };
};

/* exports */

export { createDataNodeModule };

export type { DataNodeModule, DataNodeModuleDependencies };
