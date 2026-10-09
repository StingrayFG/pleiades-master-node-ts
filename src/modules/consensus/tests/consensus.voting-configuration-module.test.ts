import { describe, expect, jest, test } from '@jest/globals';

import { GenericAbortedError } from '@/errors/application.errors';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskDefinitionHandler } from '@/modules/tasks/task.definition';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { ConsensusServiceContract } from '../consensus.service';
import { updateConsensusVotingConfigurationTaskDefinition } from '../consensus.tasks';
import { createConsensusVotingConfigurationModule } from '../consensus.voting-configuration-module';

/* fixtures */

const promotedMasterNodeId = 'master-node-bbbbbbbbbbbb';
const promotedMasterNodeSessionId = '00000000-0000-4000-8000-000000000001';

const task = updateConsensusVotingConfigurationTaskDefinition.taskSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 2n,
  sequence: 5n,
  state: 'pending',
  revision: 1n,
  type: updateConsensusVotingConfigurationTaskDefinition.type,
  executionScope: 'cluster',
  data: {
    configuration: {
      phase: 'stable',
      voterMasterNodeIds: ['master-node-aaaaaaaaaaaa', promotedMasterNodeId]
    },
    activateMasterNode: {
      id: promotedMasterNodeId,
      sessionId: promotedMasterNodeSessionId
    }
  }
});

/* helpers */

const createHandler = (
  activateMasterNode: jest.MockedFunction<MasterNodeServiceContract['activateMasterNode']>
): TaskDefinitionHandler<typeof updateConsensusVotingConfigurationTaskDefinition> => {
  const taskService = {
    registerHandler: jest.fn<TaskServiceContract['registerHandler']>()
  } as unknown as jest.Mocked<TaskServiceContract>;
  const masterNodeService = {
    activateMasterNode
  } as unknown as jest.Mocked<MasterNodeServiceContract>;

  createConsensusVotingConfigurationModule({
    taskService,
    masterNodeService,
    consensusService: {} as jest.Mocked<ConsensusServiceContract>
  });

  return taskService.registerHandler.mock.calls[0][1] as TaskDefinitionHandler<
    typeof updateConsensusVotingConfigurationTaskDefinition
  >;
};

/* tests */

describe('createConsensusVotingConfigurationModule', () => {
  test('activates the promoted master node when the stable configuration task is applied', async () => {
    const activateMasterNode = jest.fn<MasterNodeServiceContract['activateMasterNode']>();
    const handler = createHandler(activateMasterNode);

    await handler(task);

    expect(activateMasterNode).toHaveBeenCalledWith(promotedMasterNodeId, promotedMasterNodeSessionId);
  });

  test('completes task application when activation is aborted by a newer session', async () => {
    const activateMasterNode = jest
      .fn<MasterNodeServiceContract['activateMasterNode']>()
      .mockRejectedValue(new GenericAbortedError('Master node session changed'));
    const handler = createHandler(activateMasterNode);

    await expect(handler(task)).resolves.toBeUndefined();
  });

  test('preserves activation failures unrelated to concurrent membership changes', async () => {
    const activationError = new Error('Activation failed');
    const activateMasterNode = jest
      .fn<MasterNodeServiceContract['activateMasterNode']>()
      .mockRejectedValue(activationError);
    const handler = createHandler(activateMasterNode);

    await expect(handler(task)).rejects.toBe(activationError);
  });
});
