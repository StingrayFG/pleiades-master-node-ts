import type { PrismaClient } from '@prisma/client';

import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskRepositoryContract } from '@/modules/tasks/task.repository';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import { MasterNodeGrpcClient } from './master-node.grpc-client';
import { MasterNodeGrpcController } from './master-node.grpc-controller';
import { MasterNodeInternodeService } from './master-node.internode-service';
import { MasterNodeRepository } from './master-node.repository';
import { MasterNodeService } from './master-node.service';

/* contract */

type MasterNodeModuleDependencies = {
  prisma: PrismaClient;
  taskRepository: TaskRepositoryContract;
  consensusService: ConsensusServiceContract;
  byteStorageService: ByteStorageServiceContract;
  grpcConfig: GrpcClientConfig;
  grpcClientCredentials: GrpcClientCredentialsContract;
};

type MasterNodeModule = {
  repository: MasterNodeRepository;
  service: MasterNodeService;
  internodeService: MasterNodeInternodeService;
  controller: MasterNodeGrpcController;
  grpcClient: MasterNodeGrpcClient;
};

/* module */

const createMasterNodeModule = ({
  prisma,
  taskRepository,
  consensusService,
  byteStorageService,
  grpcConfig,
  grpcClientCredentials
}: MasterNodeModuleDependencies): MasterNodeModule => {
  const repository = new MasterNodeRepository(prisma);

  const service = new MasterNodeService(repository);

  const internodeService = new MasterNodeInternodeService(taskRepository, consensusService, byteStorageService);

  const controller = new MasterNodeGrpcController(internodeService);

  const grpcClient = new MasterNodeGrpcClient(grpcConfig, grpcClientCredentials);

  return {
    repository,
    service,
    internodeService,
    controller,
    grpcClient
  };
};

/* exports */

export { createMasterNodeModule };
export type { MasterNodeModule, MasterNodeModuleDependencies };
