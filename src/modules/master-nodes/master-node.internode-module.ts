import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { ElectionLifecycleHandlerContract } from '@/modules/election/lifecycle/election.lifecycle-handler';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import {
  MasterNodeLifecycleHandler,
  type MasterNodeLifecycleHandlerContract
} from './lifecycle/master-node.lifecycle-handler';
import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import { MasterNodeGrpcController } from './master-node.grpc-controller';
import { MasterNodeInternodeService } from './master-node.internode-service';
import { MasterNodeReplicationHandler } from './master-node.replication-handler';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeInternodeModuleDependencies = {
  taskService: TaskServiceContract;
  consensusService: ConsensusServiceContract;
  electionService: ElectionServiceContract;
  electionLifecycleHandler: ElectionLifecycleHandlerContract;
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
  lifecycleHandler: MasterNodeLifecycleHandlerContract;
};

/* module */

const createMasterNodeInternodeModule = ({
  taskService,
  consensusService,
  electionService,
  electionLifecycleHandler,
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
    electionService,
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
    clusterService,
    selfMasterNodeId,
    masterNodeConfig
  );

  const lifecycleHandler = new MasterNodeLifecycleHandler(
    consensusService,
    electionService,
    electionLifecycleHandler,
    replicationHandler,
    selfMasterNodeId
  );

  return {
    internodeService,
    controller,
    lifecycleHandler
  };
};

/* exports */

export { createMasterNodeInternodeModule };
export type { MasterNodeInternodeModule, MasterNodeInternodeModuleDependencies };
