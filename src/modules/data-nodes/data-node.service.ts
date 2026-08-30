import { randomUUID } from 'node:crypto';

import { GenericConflictError, GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';

import type {
  ApplyDataNodeRegistrationRepositoryInput,
  ApplyHeartbeatRepositoryInput,
  HeartbeatDataNodeInput,
  RegisterDataNodeInput
} from './data-node.application';
import type { DataNode, DataNodeHealthSnapshot, DataNodeId, DataNodeSessionId } from './data-node.domain';
import { resolveDataNodeState } from './data-node.domain-policies';
import type { DataNodeGrpcClientContract } from './data-node.grpc-client';
import { mapDataNodeToDataNodeEndpoint } from './data-node.mappers';
import type { DataNodeRepositoryContract } from './data-node.repository';

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
    private readonly grpcClient: DataNodeGrpcClientContract
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
    const sessionId = randomUUID();

    const now = new Date();

    for (let attempt = 0; attempt < 3; attempt++) {
      const currentDataNode = await this.repository.findById(input.id);

      const state = 'joining';

      const applyRegistrationInput: ApplyDataNodeRegistrationRepositoryInput = {
        id: input.id,
        endpoint: input.endpoint,

        sessionId,
        state,

        storageTotalBytes: input.healthSnapshot.storageTotalBytes,
        storageFreeBytes: input.healthSnapshot.storageFreeBytes,

        lastContactAt: now,

        expectedRevision: currentDataNode?.revision ?? null
      };

      const applyRegistrationResult = await this.repository.applyRegistration(applyRegistrationInput);

      if (applyRegistrationResult) {
        return sessionId;
      }
    }

    throw new GenericInternalServerError('Failed to register data node due to concurrent updates');
  }

  async applyDataNodeHeartbeat(input: HeartbeatDataNodeInput): Promise<void> {
    const state = resolveDataNodeState(input.healthSnapshot);

    const now = new Date();

    const applyHeartbeatInput: ApplyHeartbeatRepositoryInput = {
      id: input.id,

      sessionId: input.sessionId,
      heartbeatSequence: input.heartbeatSequence,
      state,

      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,

      lastContactAt: now,
      lastHeartbeatAt: now
    };

    const applyHeartbeatResult = await this.repository.applyHeartbeat(applyHeartbeatInput);

    if (applyHeartbeatResult) {
      return;
    }

    const dataNode = await this.repository.findById(input.id);

    if (!dataNode) {
      throw new GenericNotFoundError('Data node not found');
    }

    if (dataNode.sessionId !== input.sessionId) {
      throw new GenericConflictError('Data node session is no longer current');
    }

    return;
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
