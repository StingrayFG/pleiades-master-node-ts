import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ConsensusVotingConfigurationServiceContract } from '@/modules/consensus/consensus.voting-configuration-service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { ElectionConfig } from './election.config';
import { ElectionService } from './election.service';
import { ElectionLifecycleHandler } from './lifecycle/election.lifecycle-handler';

/* contract */

type ElectionModuleDependencies = {
  consensusService: ConsensusServiceContract;
  consensusVotingConfigurationService: ConsensusVotingConfigurationServiceContract;
  masterNodeService: MasterNodeServiceContract;
  masterNodeGrpcClient: MasterNodeGrpcClientContract;
  taskService: TaskServiceContract;
  selfMasterNodeId: MasterNodeId;
  config: ElectionConfig;
};

type ElectionModule = {
  service: ElectionService;
  lifecycleHandler: ElectionLifecycleHandler;
};

/* module */

const createElectionModule = ({
  consensusService,
  consensusVotingConfigurationService,
  masterNodeService,
  masterNodeGrpcClient,
  taskService,
  selfMasterNodeId,
  config
}: ElectionModuleDependencies): ElectionModule => {
  const service = new ElectionService(
    consensusService,
    consensusVotingConfigurationService,
    masterNodeService,
    masterNodeGrpcClient,
    taskService,
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

  return {
    service,
    lifecycleHandler
  };
};

/* exports */

export { createElectionModule };
export type { ElectionModule, ElectionModuleDependencies };
