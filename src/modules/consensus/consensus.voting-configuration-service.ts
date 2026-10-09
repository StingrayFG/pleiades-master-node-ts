import { z } from 'zod';

import {
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError
} from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId, MasterNodeSessionId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  ConsensusLastSequence,
  ConsensusVotingConfiguration,
  StableConsensusVotingConfiguration
} from './consensus.domain';
import { updateConsensusVotingConfigurationTaskDefinition } from './consensus.tasks';

/* contract */

type ConsensusVotingConfigurationServiceContract = {
  resolveVotingConfiguration(upToSequence: ConsensusLastSequence): Promise<ConsensusVotingConfiguration>;
  requestVoterAddition(masterNodeId: MasterNodeId, sessionId: MasterNodeSessionId): Promise<void>;
};

type ResolvedVotingConfiguration = {
  configuration: ConsensusVotingConfiguration;
  sequence: ConsensusLastSequence;
};

/* service */

class ConsensusVotingConfigurationService implements ConsensusVotingConfigurationServiceContract {
  private votingConfigurationChangeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly taskService: TaskServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly consensusService: ConsensusServiceContract
  ) {}

  async resolveVotingConfiguration(upToSequence: ConsensusLastSequence): Promise<ConsensusVotingConfiguration> {
    return (await this.resolveVotingConfigurationState(upToSequence)).configuration;
  }

  async requestVoterAddition(masterNodeId: MasterNodeId, sessionId: MasterNodeSessionId): Promise<void> {
    const request = this.votingConfigurationChangeQueue.then(() =>
      this.requestVoterAdditionAfterPendingChange(masterNodeId, sessionId)
    );

    this.votingConfigurationChangeQueue = request.catch(() => undefined);

    return request;
  }

  /* private methods */

  private async requestVoterAdditionAfterPendingChange(
    masterNodeId: MasterNodeId,
    sessionId: MasterNodeSessionId
  ): Promise<void> {
    const masterNode = await this.masterNodeService.getMasterNodeById(masterNodeId);

    if (masterNode.sessionId !== sessionId) {
      throw new GenericConflictError('Master node session changed before it could join the voting configuration');
    }

    if (masterNode.state !== 'joining' && masterNode.state !== 'active') {
      throw new GenericFailedPreconditionError('Master node is not eligible to join the voting configuration');
    }

    const consensusState = await this.consensusService.getConsensusState();
    const resolvedConfiguration = await this.resolveVotingConfigurationState(consensusState.lastAllocatedSequence);
    const configuration = resolvedConfiguration.configuration;

    if (configuration.phase === 'stable') {
      if (configuration.voterMasterNodeIds.includes(masterNodeId)) {
        if (
          masterNode.state === 'joining' &&
          resolvedConfiguration.sequence >= 0n &&
          resolvedConfiguration.sequence <= consensusState.lastCommittedSequence
        ) {
          await this.masterNodeService.activateMasterNode(masterNodeId, sessionId);
        }

        return;
      }

      const nextVoterMasterNodeIds = [...configuration.voterMasterNodeIds, masterNodeId].sort();

      await this.taskService.submitTask(updateConsensusVotingConfigurationTaskDefinition, {
        configuration: {
          phase: 'joint',
          previousVoterMasterNodeIds: configuration.voterMasterNodeIds,
          nextVoterMasterNodeIds
        }
      });

      return;
    }

    if (!configuration.nextVoterMasterNodeIds.includes(masterNodeId)) {
      throw new GenericFailedPreconditionError('Another voting configuration change is already in progress');
    }

    if (resolvedConfiguration.sequence > consensusState.lastCommittedSequence) {
      return;
    }

    const stableConfiguration: StableConsensusVotingConfiguration = {
      phase: 'stable',
      voterMasterNodeIds: configuration.nextVoterMasterNodeIds
    };

    await this.taskService.submitTask(updateConsensusVotingConfigurationTaskDefinition, {
      configuration: stableConfiguration,
      activateMasterNode: {
        id: masterNodeId,
        sessionId
      }
    });
  }

  private async resolveVotingConfigurationState(
    upToSequence: ConsensusLastSequence
  ): Promise<ResolvedVotingConfiguration> {
    const configurationTask = await this.taskService.findLatestTaskByTypeUpToSequence(
      updateConsensusVotingConfigurationTaskDefinition.type,
      upToSequence
    );

    if (configurationTask) {
      const data = z.decode(
        updateConsensusVotingConfigurationTaskDefinition.persistedDataSchema,
        configurationTask.data
      );

      return {
        configuration: data.configuration,
        sequence: configurationTask.sequence
      };
    }

    const masterNodes = await this.masterNodeService.listMasterNodes();
    const voterMasterNodeIds = masterNodes
      .filter((masterNode) => masterNode.state !== 'joining')
      .map((masterNode) => masterNode.id);

    if (voterMasterNodeIds.length === 0) {
      throw new GenericInternalServerError('Consensus voting configuration has no master node voters');
    }

    return {
      configuration: {
        phase: 'stable',
        voterMasterNodeIds
      },
      sequence: -1n
    };
  }
}

/* exports */

export { ConsensusVotingConfigurationService };
export type { ConsensusVotingConfigurationServiceContract };
