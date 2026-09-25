import type { PrismaClient } from '@prisma/client';

import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeConfig } from './master-node.config';
import { MasterNodeGrpcClient } from './master-node.grpc-client';
import { MasterNodeGrpcController } from './master-node.grpc-controller';
import { MasterNodeInternodeService } from './master-node.internode-service';
import {
  MasterNodeReplicationHandler,
  type MasterNodeReplicationHandlerContract
} from './master-node.replication-handler';
import { MasterNodeRepository } from './master-node.repository';
import { MasterNodeService } from './master-node.service';

/* contract */

type MasterNodeModuleDependencies = {
  prisma: PrismaClient;
  taskService: TaskServiceContract;
  consensusService: ConsensusServiceContract;
  selfMasterNodeId: MasterNodeId;
  selfMasterNodeSessionId: MasterNodeSessionId;
  clusterService: ClusterServiceContract;
  grpcConfig: GrpcClientConfig;
  grpcClientCredentials: GrpcClientCredentialsContract;
  masterNodeConfig: MasterNodeConfig;
};

type MasterNodeModule = {
  repository: MasterNodeRepository;
  service: MasterNodeService;
  internodeService: MasterNodeInternodeService;
  controller: MasterNodeGrpcController;
  grpcClient: MasterNodeGrpcClient;
  replicationHandler: MasterNodeReplicationHandlerContract;
};

/* module */

const createMasterNodeModule = ({
  prisma,
  taskService,
  consensusService,
  selfMasterNodeId,
  selfMasterNodeSessionId,
  clusterService,
  grpcConfig,
  grpcClientCredentials,
  masterNodeConfig
}: MasterNodeModuleDependencies): MasterNodeModule => {
  const repository = new MasterNodeRepository(prisma);

  const service = new MasterNodeService(repository);

  const internodeService = new MasterNodeInternodeService(
    taskService,
    consensusService,
    selfMasterNodeId,
    selfMasterNodeSessionId,
    clusterService,
    service
  );

  const controller = new MasterNodeGrpcController(internodeService);

  const grpcClient = new MasterNodeGrpcClient(
    grpcConfig,
    grpcClientCredentials,
    selfMasterNodeId,
    selfMasterNodeSessionId
  );

  const replicationHandler = new MasterNodeReplicationHandler(
    grpcClient,
    service,
    taskService,
    consensusService,
    selfMasterNodeId,
    masterNodeConfig
  );

  return {
    repository,
    service,
    internodeService,
    controller,
    grpcClient,
    replicationHandler
  };
};

/* exports */

export { createMasterNodeModule };
export type { MasterNodeModule, MasterNodeModuleDependencies };
