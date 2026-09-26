import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import { MasterNodeGrpcController } from './master-node.grpc-controller';
import { MasterNodeInternodeService } from './master-node.internode-service';
import { MasterNodeReplicationHandler, type MasterNodeReplicationHandlerContract } from './master-node.replication-handler';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeInternodeModuleDependencies = {
  taskService: TaskServiceContract;
  consensusService: ConsensusServiceContract;
  selfMasterNodeId: MasterNodeId;
  selfMasterNodeSessionId: MasterNodeSessionId;
  clusterService: ClusterServiceContract;
  masterNodeService: MasterNodeServiceContract;
  masterNodeGrpcClient: MasterNodeGrpcClientContract;
  masterNodeConfig: MasterNodeConfig;
};

type MasterNodeInternodeModule = {
  internodeService: MasterNodeInternodeService;
  controller: MasterNodeGrpcController;
  replicationHandler: MasterNodeReplicationHandlerContract;
};

/* module */

const createMasterNodeInternodeModule = ({
  taskService,
  consensusService,
  selfMasterNodeId,
  selfMasterNodeSessionId,
  clusterService,
  masterNodeService,
  masterNodeGrpcClient,
  masterNodeConfig
}: MasterNodeInternodeModuleDependencies): MasterNodeInternodeModule => {
  const internodeService = new MasterNodeInternodeService(
    taskService,
    consensusService,
    selfMasterNodeId,
    selfMasterNodeSessionId,
    clusterService,
    masterNodeService
  );

  const controller = new MasterNodeGrpcController(internodeService);

  const replicationHandler = new MasterNodeReplicationHandler(
    masterNodeGrpcClient,
    masterNodeService,
    taskService,
    consensusService,
    selfMasterNodeId,
    masterNodeConfig
  );

  return {
    internodeService,
    controller,
    replicationHandler
  };
};

/* exports */

export { createMasterNodeInternodeModule };
export type { MasterNodeInternodeModule, MasterNodeInternodeModuleDependencies };
