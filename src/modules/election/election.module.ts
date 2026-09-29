import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { ElectionConfig } from './election.config';
import { ElectionService } from './election.service';
import { ElectionCommitmentHandler } from './lifecycle/election.commitment-handler';
import { ElectionLifecycleHandler } from './lifecycle/election.lifecycle-handler';

/* contract */

type ElectionModuleDependencies = {
  consensusService: ConsensusServiceContract;
  masterNodeService: MasterNodeServiceContract;
  masterNodeGrpcClient: MasterNodeGrpcClientContract;
  taskService: TaskServiceContract;
  taskApplyHandler: TaskApplyHandlerContract;
  selfMasterNodeId: MasterNodeId;
  config: ElectionConfig;
};

type ElectionModule = {
  service: ElectionService;
  lifecycleHandler: ElectionLifecycleHandler;
  commitmentHandler: ElectionCommitmentHandler;
};

/* module */

const createElectionModule = ({
  consensusService,
  masterNodeService,
  masterNodeGrpcClient,
  taskService,
  taskApplyHandler,
  selfMasterNodeId,
  config
}: ElectionModuleDependencies): ElectionModule => {
  const service = new ElectionService(
    consensusService,
    masterNodeService,
    masterNodeGrpcClient,
    taskService,
    taskApplyHandler,
    selfMasterNodeId,
    config
  );

  const lifecycleHandler = new ElectionLifecycleHandler(
    consensusService,
    service,
    masterNodeService,
    selfMasterNodeId,
    config
  );

  const commitmentHandler = new ElectionCommitmentHandler(service);

  return {
    service,
    lifecycleHandler,
    commitmentHandler
  };
};

/* exports */

export { createElectionModule };
export type { ElectionModule, ElectionModuleDependencies };
