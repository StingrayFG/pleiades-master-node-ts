import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { CONSENSUS_STATE_ID, type ConsensusState } from '../consensus.domain';
import type { ConsensusServiceContract } from '../consensus.service';
import { updateConsensusVotingConfigurationTaskDefinition } from '../consensus.tasks';
import { ConsensusVotingConfigurationService } from '../consensus.voting-configuration-service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const masterNodeAId = 'master-node-aaaaaaaaaaaa';
const masterNodeBId = 'master-node-bbbbbbbbbbbb';

const createMasterNode = (id: string, state: MasterNode['state']): MasterNode => ({
  id,
  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state,
  mode: 'serving',
  hostname: `${id}.internal`,
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
});

const masterNodeA = createMasterNode(masterNodeAId, 'active');
const masterNodeB = createMasterNode(masterNodeBId, 'joining');

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: masterNodeAId,
  votedForMasterId: masterNodeAId,
  lastLeaderContactAt: now,
  lastAllocatedSequence: 5n,
  lastMatchedSequence: 5n,
  lastCommittedSequence: 4n,
  lastAppliedSequence: 4n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

const createConfigurationTask = (data: PersistedTask['data'], sequence = 5n): PersistedTask => ({
  id: '00000000-0000-4000-8000-000000000001',
  originMasterNodeId: masterNodeAId,
  epoch: 2n,
  sequence,
  type: updateConsensusVotingConfigurationTaskDefinition.type,
  executionScope: 'cluster',
  data,
  payloadId: null,
  state: 'pending',
  createdAt: now,
  updatedAt: now,
  revision: 1n
});

/* tests */

describe('ConsensusVotingConfigurationService', () => {
  let taskService: jest.Mocked<TaskServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let service: ConsensusVotingConfigurationService;

  beforeEach(() => {
    taskService = {
      findLatestTaskByTypeUpToSequence: jest
        .fn<TaskServiceContract['findLatestTaskByTypeUpToSequence']>()
        .mockResolvedValue(null),
      submitTask: jest.fn<TaskServiceContract['submitTask']>()
    } as unknown as jest.Mocked<TaskServiceContract>;
    masterNodeService = {
      listMasterNodes: jest
        .fn<MasterNodeServiceContract['listMasterNodes']>()
        .mockResolvedValue([masterNodeA, masterNodeB]),
      getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>().mockResolvedValue(masterNodeB),
      activateMasterNode: jest.fn<MasterNodeServiceContract['activateMasterNode']>()
    } as unknown as jest.Mocked<MasterNodeServiceContract>;
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;
    service = new ConsensusVotingConfigurationService(taskService, masterNodeService, consensusService);
  });

  test('derives the initial stable configuration from non-joining members', async () => {
    await expect(service.resolveVotingConfiguration(consensusState.lastAllocatedSequence)).resolves.toEqual({
      phase: 'stable',
      voterMasterNodeIds: [masterNodeAId]
    });
  });

  test('resolves the latest voting configuration task at the requested sequence', async () => {
    const configuration = {
      phase: 'joint' as const,
      previousVoterMasterNodeIds: [masterNodeAId],
      nextVoterMasterNodeIds: [masterNodeAId, masterNodeBId]
    };

    taskService.findLatestTaskByTypeUpToSequence.mockResolvedValue(createConfigurationTask({ configuration }));

    await expect(service.resolveVotingConfiguration(5n)).resolves.toEqual(configuration);
    expect(taskService.findLatestTaskByTypeUpToSequence).toHaveBeenCalledWith(
      updateConsensusVotingConfigurationTaskDefinition.type,
      5n
    );
  });

  test('submits a joint configuration when adding a new voter', async () => {
    await service.requestVoterAddition(masterNodeB.id, masterNodeB.sessionId);

    expect(taskService.submitTask).toHaveBeenCalledWith(updateConsensusVotingConfigurationTaskDefinition, {
      configuration: {
        phase: 'joint',
        previousVoterMasterNodeIds: [masterNodeAId],
        nextVoterMasterNodeIds: [masterNodeAId, masterNodeBId]
      }
    });
  });

  test('waits for the joint configuration to commit before submitting the stable configuration', async () => {
    taskService.findLatestTaskByTypeUpToSequence.mockResolvedValue(
      createConfigurationTask({
        configuration: {
          phase: 'joint',
          previousVoterMasterNodeIds: [masterNodeAId],
          nextVoterMasterNodeIds: [masterNodeAId, masterNodeBId]
        }
      })
    );

    await service.requestVoterAddition(masterNodeB.id, masterNodeB.sessionId);

    expect(taskService.submitTask).not.toHaveBeenCalled();
  });

  test('submits the stable configuration and activation after the joint configuration commits', async () => {
    taskService.findLatestTaskByTypeUpToSequence.mockResolvedValue(
      createConfigurationTask(
        {
          configuration: {
            phase: 'joint',
            previousVoterMasterNodeIds: [masterNodeAId],
            nextVoterMasterNodeIds: [masterNodeAId, masterNodeBId]
          }
        },
        4n
      )
    );

    await service.requestVoterAddition(masterNodeB.id, masterNodeB.sessionId);

    expect(taskService.submitTask).toHaveBeenCalledWith(updateConsensusVotingConfigurationTaskDefinition, {
      configuration: {
        phase: 'stable',
        voterMasterNodeIds: [masterNodeAId, masterNodeBId]
      },
      activateMasterNode: {
        id: masterNodeB.id,
        sessionId: masterNodeB.sessionId
      }
    });
  });

  test('retries activation after the stable configuration commits', async () => {
    taskService.findLatestTaskByTypeUpToSequence.mockResolvedValue(
      createConfigurationTask(
        {
          configuration: {
            phase: 'stable',
            voterMasterNodeIds: [masterNodeAId, masterNodeBId]
          },
          activateMasterNode: {
            id: masterNodeB.id,
            sessionId: masterNodeB.sessionId
          }
        },
        4n
      )
    );

    await service.requestVoterAddition(masterNodeB.id, masterNodeB.sessionId);

    expect(masterNodeService.activateMasterNode).toHaveBeenCalledWith(masterNodeB.id, masterNodeB.sessionId);
    expect(taskService.submitTask).not.toHaveBeenCalled();
  });

  test('rejects a voter addition when another configuration change is in progress', async () => {
    taskService.findLatestTaskByTypeUpToSequence.mockResolvedValue(
      createConfigurationTask({
        configuration: {
          phase: 'joint',
          previousVoterMasterNodeIds: [masterNodeAId],
          nextVoterMasterNodeIds: [masterNodeAId]
        }
      })
    );

    await expect(service.requestVoterAddition(masterNodeB.id, masterNodeB.sessionId)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
  });

  test('rejects a voter addition after the master node session changes', async () => {
    await expect(
      service.requestVoterAddition(masterNodeB.id, '00000000-0000-4000-8000-000000000099')
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(taskService.submitTask).not.toHaveBeenCalled();
  });
});
