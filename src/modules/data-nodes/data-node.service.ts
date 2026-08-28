import { GenericNotFoundError } from '@/errors/application.errors';

import type {
  ApplyHeartbeatRepositoryInput,
  HeartbeatDataNodeInput,
  RegisterDataNodeInput,
  UpsertDataNodeRepositoryInput
} from './data-node.application';
import { type DataNode, type DataNodeHealthSnapshot, type DataNodeId, resolveDataNodeState } from './data-node.domain';
import type { DataNodeGrpcClientContract } from './data-node.grpc-client';
import { mapDataNodeToDataNodeEndpoint } from './data-node.mappers';
import type { DataNodeRepositoryContract } from './data-node.repository';

/* contract */

type DataNodeServiceContract = {
  listActiveDataNodes(): Promise<DataNode[]>;
  getDataNodeById(id: DataNodeId): Promise<DataNode>;
  registerDataNode(input: RegisterDataNodeInput): Promise<DataNode>;
  recordDataNodeHeartbeat(input: HeartbeatDataNodeInput): Promise<DataNode>;
  checkDataNodeHealth(id: DataNodeId): Promise<DataNodeHealthSnapshot>;
};

/* service */

class DataNodeService implements DataNodeServiceContract {
  constructor(
    private readonly repository: DataNodeRepositoryContract,
    private readonly grpcClient: DataNodeGrpcClientContract
  ) {}

  async listActiveDataNodes(): Promise<DataNode[]> {
    const dataNodes = await this.repository.findAllActive();

    return dataNodes;
  }

  async getDataNodeById(id: DataNodeId): Promise<DataNode> {
    const dataNode = await this.repository.findById(id);

    if (!dataNode) {
      throw new GenericNotFoundError('Data node not found');
    }

    return dataNode;
  }

  async registerDataNode(input: RegisterDataNodeInput): Promise<DataNode> {
    const state = resolveDataNodeState(input.healthSnapshot);

    const now = new Date();

    const repositoryInput: UpsertDataNodeRepositoryInput = {
      id: input.id,
      hostname: input.hostname,
      port: input.port,
      scheme: input.scheme,
      state: state,
      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,
      lastHeartbeatAt: now
    };

    return await this.repository.upsert(repositoryInput);
  }

  async recordDataNodeHeartbeat(input: HeartbeatDataNodeInput): Promise<DataNode> {
    const state = resolveDataNodeState(input.healthSnapshot);

    const now = new Date();

    const repositoryInput: ApplyHeartbeatRepositoryInput = {
      id: input.id,
      state: state,
      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,
      lastHeartbeatAt: now
    };

    return await this.repository.applyHeartbeat(repositoryInput);
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
