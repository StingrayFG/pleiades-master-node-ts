import type { PrismaClient } from '@prisma/client';

import { DataNodeGrpcClient } from './data-node.grpc-client';
import { DataNodeGrpcController } from './data-node.grpc-controller';
import { DataNodeRepository } from './data-node.repository';
import { DataNodeService } from './data-node.service';

/**/

type DataNodeModuleDependencies = {
  prisma: PrismaClient;
};

type DataNodeModule = {
  repository: DataNodeRepository;
  grpcClient: DataNodeGrpcClient;
  service: DataNodeService;
  controller: DataNodeGrpcController;
};

/**/

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

/**/

export { createDataNodeModule };

export type { DataNodeModule, DataNodeModuleDependencies };
