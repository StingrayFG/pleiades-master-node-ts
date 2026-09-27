import type { PrismaClient } from '@prisma/client';

import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import { MasterNodeGrpcClient } from './master-node.grpc-client';
import { MasterNodeController } from './master-node.http-controller';
import { MasterNodeRepository } from './master-node.repository';
import { MasterNodeService } from './master-node.service';
import { MasterNodeTaskForwarder } from './master-node.task-forwarder';

/* contract */

type MasterNodeModuleDependencies = {
  prisma: PrismaClient;
  selfMasterNodeId: MasterNodeId;
  selfMasterNodeSessionId: MasterNodeSessionId;
  clusterService: ClusterServiceContract;
  consensusService: ConsensusServiceContract;
  grpcConfig: GrpcClientConfig;
  grpcClientCredentials: GrpcClientCredentialsContract;
};

type MasterNodeModule = {
  repository: MasterNodeRepository;
  service: MasterNodeService;
  controller: MasterNodeController;
  grpcClient: MasterNodeGrpcClient;
  taskForwarder: MasterNodeTaskForwarder;
};

/* module */

const createMasterNodeModule = ({
  prisma,
  selfMasterNodeId,
  selfMasterNodeSessionId,
  clusterService,
  consensusService,
  grpcConfig,
  grpcClientCredentials
}: MasterNodeModuleDependencies): MasterNodeModule => {
  const repository = new MasterNodeRepository(prisma);

  const service = new MasterNodeService(repository, consensusService, clusterService, selfMasterNodeId);

  const controller = new MasterNodeController(service);

  const grpcClient = new MasterNodeGrpcClient(
    grpcConfig,
    grpcClientCredentials,
    selfMasterNodeId,
    selfMasterNodeSessionId
  );

  const taskForwarder = new MasterNodeTaskForwarder(grpcClient, service);

  return {
    repository,
    service,
    controller,
    grpcClient,
    taskForwarder
  };
};

/* exports */

export { createMasterNodeModule };
export type { MasterNodeModule, MasterNodeModuleDependencies };
