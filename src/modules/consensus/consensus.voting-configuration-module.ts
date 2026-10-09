import { GenericAbortedError } from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { updateConsensusVotingConfigurationTaskDefinition } from './consensus.tasks';
import { ConsensusVotingConfigurationService } from './consensus.voting-configuration-service';

/* contract */

type ConsensusVotingConfigurationModuleDependencies = {
  taskService: TaskServiceContract;
  masterNodeService: MasterNodeServiceContract;
  consensusService: ConsensusServiceContract;
};

type ConsensusVotingConfigurationModule = {
  service: ConsensusVotingConfigurationService;
};

/* module */

const createConsensusVotingConfigurationModule = ({
  taskService,
  masterNodeService,
  consensusService
}: ConsensusVotingConfigurationModuleDependencies): ConsensusVotingConfigurationModule => {
  taskService.registerHandler(updateConsensusVotingConfigurationTaskDefinition, async (task) => {
    if (task.data.activateMasterNode) {
      try {
        await masterNodeService.activateMasterNode(
          task.data.activateMasterNode.id,
          task.data.activateMasterNode.sessionId
        );
      } catch (err) {
        if (!(err instanceof GenericAbortedError)) {
          throw err;
        }

        // ignore activation aborted by a concurrent registration or membership change;
        // a joining node retries activation after catching up under its current session.
      }
    }
  });

  const service = new ConsensusVotingConfigurationService(taskService, masterNodeService, consensusService);

  return { service };
};

/* exports */

export { createConsensusVotingConfigurationModule };
export type { ConsensusVotingConfigurationModule, ConsensusVotingConfigurationModuleDependencies };
