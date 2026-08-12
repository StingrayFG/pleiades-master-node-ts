import { GenericNotFoundError } from '@/errors/application.errors';

import type {
  ApplyHeartbeatRepositoryInput,
  CheckHealthDataNodeClientInput,
  HeartbeatDataNodeInput,
  RegisterDataNodeInput,
  UpsertDataNodeRepositoryInput
} from './data-node.application';
import type { DataNodeGrpcClientContract } from './data-node.grpc-client';
import { type DataNode, type DataNodeHealthSnapshot, type DataNodeId, resolveDataNodeState } from './data-node.domain';
import type { DataNodeRepositoryContract } from './data-node.repository';

/**/

type DataNodeServiceContract = {
  registerDataNode(input: RegisterDataNodeInput): Promise<DataNode>;
  heartbeatDataNode(input: HeartbeatDataNodeInput): Promise<DataNode>;
  checkHealthDataNode(nodeId: DataNodeId): Promise<DataNodeHealthSnapshot>;
};

/**/

class DataNodeService implements DataNodeServiceContract {
  constructor(
    private readonly repository: DataNodeRepositoryContract,
    private readonly grpcClient: DataNodeGrpcClientContract
  ) {}

  async registerDataNode(input: RegisterDataNodeInput): Promise<DataNode> {
    const state = resolveDataNodeState(input.healthSnapshot);

    const now = new Date();

    const repositoryInput: UpsertDataNodeRepositoryInput = {
      nodeId: input.nodeId,
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

  async heartbeatDataNode(input: HeartbeatDataNodeInput): Promise<DataNode> {
    const now = new Date();

    const state = resolveDataNodeState(input.healthSnapshot);

    const repositoryInput: ApplyHeartbeatRepositoryInput = {
      nodeId: input.nodeId,
      state: state,
      storageTotalBytes: input.healthSnapshot.storageTotalBytes,
      storageFreeBytes: input.healthSnapshot.storageFreeBytes,
      lastHeartbeatAt: now
    };

    return await this.repository.applyHeartbeat(repositoryInput);
  }

  async checkHealthDataNode(nodeId: DataNodeId): Promise<DataNodeHealthSnapshot> {
    const dataNode = await this.repository.findById(nodeId);

    if (!dataNode) {
      throw new GenericNotFoundError();
    }

    const clientInput: CheckHealthDataNodeClientInput = {
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme
    };

    return await this.grpcClient.checkHealthDataNode(clientInput);
  }
}

/**/

export { DataNodeService };

export type { DataNodeServiceContract };
