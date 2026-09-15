import {
  GenericConflictError,
  GenericForbiddenError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { TaskDefinitionHandler, TaskDefinitionResult, TaskDefinitionTask } from '@/modules/tasks/task.definition';

import type {
  ApplyDataNodeRegistrationRepositoryInput,
  ApplyHeartbeatRepositoryInput,
  RecordDataNodeHealthCheckRepositoryInput,
  UpdateDataNodeStateRepositoryInput
} from './data-node.application';
import type { DataNodeRepositoryContract } from './data-node.repository';
import type {
  applyDataNodeHeartbeatTaskDefinition,
  recordDataNodeHealthCheckTaskDefinition,
  registerDataNodeTaskDefinition,
  updateDataNodeStateTaskDefinition
} from './data-node.tasks';

/* contract */

type DataNodeTaskHandlerContract = {
  registerDataNode: TaskDefinitionHandler<typeof registerDataNodeTaskDefinition>;
  applyDataNodeHeartbeat: TaskDefinitionHandler<typeof applyDataNodeHeartbeatTaskDefinition>;
  recordDataNodeHealthCheck: TaskDefinitionHandler<typeof recordDataNodeHealthCheckTaskDefinition>;
  updateDataNodeState: TaskDefinitionHandler<typeof updateDataNodeStateTaskDefinition>;
};

/* handler */

class DataNodeTaskHandler implements DataNodeTaskHandlerContract {
  constructor(private readonly repository: DataNodeRepositoryContract) {}

  async registerDataNode(
    task: TaskDefinitionTask<typeof registerDataNodeTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof registerDataNodeTaskDefinition>> {
    const currentDataNode = await this.repository.findById(task.data.id);

    if (currentDataNode && currentDataNode.certificateFingerprint !== task.data.certificateFingerprint) {
      throw new GenericForbiddenError('Data node certificate does not match the registered certificate');
    }

    if (currentDataNode?.sessionId === task.data.sessionId) {
      return task.data.sessionId;
    }

    const applyRegistrationInput: ApplyDataNodeRegistrationRepositoryInput = task.data;

    const applyRegistrationResult = await this.repository.applyRegistration(applyRegistrationInput);

    if (applyRegistrationResult) {
      return task.data.sessionId;
    }

    const resultingDataNode = await this.repository.findById(task.data.id);

    if (resultingDataNode && resultingDataNode.certificateFingerprint !== task.data.certificateFingerprint) {
      throw new GenericForbiddenError('Data node certificate does not match the registered certificate');
    }

    if (resultingDataNode?.sessionId === task.data.sessionId) {
      return task.data.sessionId;
    }

    throw new GenericConflictError('Data node registration was superseded by another registration');
  }

  async applyDataNodeHeartbeat(
    task: TaskDefinitionTask<typeof applyDataNodeHeartbeatTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof applyDataNodeHeartbeatTaskDefinition>> {
    const applyHeartbeatInput: ApplyHeartbeatRepositoryInput = task.data;

    const applyHeartbeatResult = await this.repository.applyHeartbeat(applyHeartbeatInput);

    if (applyHeartbeatResult) {
      return true;
    }

    const dataNode = await this.repository.findById(task.data.id);

    if (!dataNode) {
      throw new GenericNotFoundError('Data node not found');
    }

    if (dataNode.certificateFingerprint !== task.data.certificateFingerprint) {
      throw new GenericForbiddenError('Data node certificate does not match the registered certificate');
    }

    if (dataNode.sessionId !== task.data.sessionId) {
      throw new GenericConflictError('Data node session is no longer current');
    }

    return true;
  }

  async recordDataNodeHealthCheck(
    task: TaskDefinitionTask<typeof recordDataNodeHealthCheckTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof recordDataNodeHealthCheckTaskDefinition>> {
    const healthCheckInput: RecordDataNodeHealthCheckRepositoryInput = task.data;

    const healthCheckResult = await this.repository.applyHealthCheck(healthCheckInput);

    if (healthCheckResult) {
      return true;
    }

    const dataNode = await this.repository.findById(task.data.id);

    return dataNode?.lastHealthCheckAt?.getTime() === task.data.lastHealthCheckAt.getTime();
  }

  async updateDataNodeState(
    task: TaskDefinitionTask<typeof updateDataNodeStateTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof updateDataNodeStateTaskDefinition>> {
    const stateUpdateInput: UpdateDataNodeStateRepositoryInput = task.data;

    const stateUpdateResult = await this.repository.updateStateIfRevisionUnchanged(stateUpdateInput);

    if (stateUpdateResult) {
      return true;
    }

    const dataNode = await this.repository.findById(task.data.id);

    return dataNode?.state === task.data.state;
  }
}

/* exports */

export { DataNodeTaskHandler };
export type { DataNodeTaskHandlerContract };
