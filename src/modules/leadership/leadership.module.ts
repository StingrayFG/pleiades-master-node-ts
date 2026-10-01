import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { LeadershipConfig } from './leadership.config';
import { LeadershipService } from './leadership.service';
import { LeadershipCommitmentHandler } from './lifecycle/leadership.commitment-handler';

/* contract */

type LeadershipModuleDependencies = {
  consensusService: ConsensusServiceContract;
  masterNodeService: MasterNodeServiceContract;
  masterNodeGrpcClient: MasterNodeGrpcClientContract;
  taskService: TaskServiceContract;
  taskApplyHandler: TaskApplyHandlerContract;
  selfMasterNodeId: MasterNodeId;
  config: LeadershipConfig;
};

type LeadershipModule = {
  service: LeadershipService;
  commitmentHandler: LeadershipCommitmentHandler;
};

/* module */

const createLeadershipModule = ({
  consensusService,
  masterNodeService,
  masterNodeGrpcClient,
  taskService,
  taskApplyHandler,
  selfMasterNodeId,
  config
}: LeadershipModuleDependencies): LeadershipModule => {
  const service = new LeadershipService(
    consensusService,
    masterNodeService,
    masterNodeGrpcClient,
    taskService,
    taskApplyHandler,
    selfMasterNodeId,
    config
  );

  const commitmentHandler = new LeadershipCommitmentHandler(service);

  return {
    service,
    commitmentHandler
  };
};

/* exports */

export { createLeadershipModule };
export type { LeadershipModule, LeadershipModuleDependencies };
