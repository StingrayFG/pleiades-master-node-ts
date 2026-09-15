import { randomUUID } from 'node:crypto';

import { GenericConflictError, GenericForbiddenError, GenericNotFoundError } from '@/errors/application.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { HeartbeatDataNodeInput, RegisterDataNodeInput } from './data-node.application';
import type { DataNode, DataNodeHealthSnapshot, DataNodeId, DataNodeSessionId } from './data-node.domain';
import { resolveDataNodeState } from './data-node.domain-policies';
import type { DataNodeGrpcClientContract } from './data-node.grpc-client';
import { mapDataNodeToDataNodeEndpoint } from './data-node.mappers';
import type { DataNodeRepositoryContract } from './data-node.repository';
import {
  applyDataNodeHeartbeatTaskDefinition,
  registerDataNodeTaskDefinition,
  type ApplyDataNodeHeartbeatTaskData,
  type RegisterDataNodeTaskData
} from './data-node.tasks';

/* contract */

type DataNodeServiceContract = {
  listAvailableDataNodes(): Promise<DataNode[]>;
  getDataNodeById(id: DataNodeId): Promise<DataNode>;
  registerDataNode(input: RegisterDataNodeInput): Promise<DataNodeSessionId>;
  applyDataNodeHeartbeat(input: HeartbeatDataNodeInput): Promise<void>;
  checkDataNodeHealth(id: DataNodeId): Promise<DataNodeHealthSnapshot>;
};

/* service */

class DataNodeService implements DataNodeServiceContract {
  constructor(
    private readonly repository: DataNodeRepositoryContract,
    private readonly grpcClient: DataNodeGrpcClientContract,
    private readonly taskService: TaskServiceContract
  ) {}

  async listAvailableDataNodes(): Promise<DataNode[]> {
    const dataNodes = await this.repository.listAvailable();

    return dataNodes;
  }

  async getDataNodeById(id: DataNodeId): Promise<DataNode> {
    const dataNode = await this.repository.findById(id);

    if (!dataNode) {
      throw new GenericNotFoundError('Data node not found');
    }

    return dataNode;
  }

  async registerDataNode(input: RegisterDataNodeInput): Promise<DataNodeSessionId> {
    const currentDataNode = await this.repository.findById(input.id);

    if (currentDataNode && currentDataNode.certificateFingerprint !== input.certificateFingerprint) {
      throw new GenericForbiddenError('Data node certificate does not match the registered certificate');
    }

    const taskData: RegisterDataNodeTaskData = {
      id: input.id,

      certificateFingerprint: input.certificateFingerprint,
      sessionId: randomUUID(),
      state: 'joining',

      endpoint: input.endpoint,

      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,

      lastContactAt: new Date(),

      expectedRevision: currentDataNode?.revision ?? null
    };

    await this.taskService.executeTaskByDefinition(registerDataNodeTaskDefinition, taskData);

    return taskData.sessionId;
  }

  async applyDataNodeHeartbeat(input: HeartbeatDataNodeInput): Promise<void> {
    const dataNode = await this.repository.findById(input.id);

    if (!dataNode) {
      throw new GenericNotFoundError('Data node not found');
    }

    if (dataNode.certificateFingerprint !== input.certificateFingerprint) {
      throw new GenericForbiddenError('Data node certificate does not match the registered certificate');
    }

    if (dataNode.sessionId !== input.sessionId) {
      throw new GenericConflictError('Data node session is no longer current');
    }

    if (dataNode.lastHeartbeatSequence >= input.heartbeatSequence) {
      return;
    }

    const now = new Date();

    const taskData: ApplyDataNodeHeartbeatTaskData = {
      id: input.id,

      certificateFingerprint: input.certificateFingerprint,
      sessionId: input.sessionId,
      heartbeatSequence: input.heartbeatSequence,
      state: resolveDataNodeState(input.healthSnapshot),

      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,

      lastContactAt: now,
      lastHeartbeatAt: now
    };

    await this.taskService.executeTaskByDefinition(applyDataNodeHeartbeatTaskDefinition, taskData);
  }

  async checkDataNodeHealth(id: DataNodeId): Promise<DataNodeHealthSnapshot> {
    const dataNode = await this.repository.findById(id);

    if (!dataNode) {
      throw new GenericNotFoundError();
    }

    const dataNodeEndpoint = mapDataNodeToDataNodeEndpoint(dataNode);

    return await this.grpcClient.checkDataNodeHealth(dataNodeEndpoint);
  }
}

/* exports */

export { DataNodeService };
export type { DataNodeServiceContract };
