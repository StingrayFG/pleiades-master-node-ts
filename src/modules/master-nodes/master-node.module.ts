import type { PrismaClient } from '@prisma/client';

import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import { MasterNodeGrpcClient } from './master-node.grpc-client';
import { MasterNodeRepository } from './master-node.repository';
import { MasterNodeService } from './master-node.service';
import { MasterNodeTaskForwarder } from './master-node.task-forwarder';

/* contract */

type MasterNodeModuleDependencies = {
  prisma: PrismaClient;
  selfMasterNodeId: MasterNodeId;
  selfMasterNodeSessionId: MasterNodeSessionId;
  grpcConfig: GrpcClientConfig;
  grpcClientCredentials: GrpcClientCredentialsContract;
};

type MasterNodeModule = {
  repository: MasterNodeRepository;
  service: MasterNodeService;
  grpcClient: MasterNodeGrpcClient;
  taskForwarder: MasterNodeTaskForwarder;
};

/* module */

const createMasterNodeModule = ({
  prisma,
  selfMasterNodeId,
  selfMasterNodeSessionId,
  grpcConfig,
  grpcClientCredentials
}: MasterNodeModuleDependencies): MasterNodeModule => {
  const repository = new MasterNodeRepository(prisma);

  const service = new MasterNodeService(repository);

  const grpcClient = new MasterNodeGrpcClient(grpcConfig, grpcClientCredentials, selfMasterNodeId, selfMasterNodeSessionId);

  const taskForwarder = new MasterNodeTaskForwarder(grpcClient, service);

  return {
    repository,
    service,
    grpcClient,
    taskForwarder
  };
};

/* exports */

export { createMasterNodeModule };
export type { MasterNodeModule, MasterNodeModuleDependencies };
