import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { ElectionLifecycleHandlerContract } from '@/modules/election/lifecycle/election.lifecycle-handler';
import type { LeadershipServiceContract } from '@/modules/leadership/leadership.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import {
  MasterNodeLifecycleHandler,
  type MasterNodeLifecycleHandlerContract
} from './lifecycle/master-node.lifecycle-handler';
import { MasterNodeClusterSynchronizationHandler } from './lifecycle/master-node.cluster-synchronization-handler';
import { MasterNodeTaskReplicationHandler } from './lifecycle/master-node.task-replication-handler';
import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import { MasterNodeGrpcController } from './master-node.grpc-controller';
import { MasterNodeInternodeService } from './master-node.internode-service';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeInternodeModuleDependencies = {
  taskService: TaskServiceContract;
  consensusService: ConsensusServiceContract;
  electionService: ElectionServiceContract;
  electionLifecycleHandler: ElectionLifecycleHandlerContract;
  leadershipService: LeadershipServiceContract;
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
  leadershipService,
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
    leadershipService,
    selfMasterNodeId,
    selfMasterNodeSessionId,
    clusterService,
    masterNodeService
  );

  const controller = new MasterNodeGrpcController(internodeService);

  const clusterSynchronizationHandler = new MasterNodeClusterSynchronizationHandler(
    masterNodeGrpcClient,
    clusterService
  );

  const taskReplicationHandler = new MasterNodeTaskReplicationHandler(
    masterNodeGrpcClient,
    masterNodeService,
    taskService,
    consensusService,
    clusterSynchronizationHandler,
    selfMasterNodeId,
    masterNodeConfig
  );

  const lifecycleHandler = new MasterNodeLifecycleHandler(
    consensusService,
    leadershipService,
    electionLifecycleHandler,
    taskReplicationHandler,
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
