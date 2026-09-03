import { InternodeApplicationError } from '@/errors/internode.errors';

import type {
  RecordDataNodeHealthCheckRepositoryInput,
  UpdateDataNodeStateRepositoryInput
} from '../data-node.application';
import type { DataNode, DataNodeState } from '../data-node.domain';
import { resolveDataNodeState } from '../data-node.domain-policies';
import type { DataNodeGrpcClientContract } from '../data-node.grpc-client';
import { mapDataNodeToDataNodeEndpoint } from '../data-node.mappers';
import type { DataNodeRepositoryContract } from '../data-node.repository';
import { resolveDataNodeStateFromContactSilence, shouldCheckDataNodeHealth } from './data-node-lifecycle.policies';

/* contract */

type DataNodeLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class DataNodeLifecycleHandler implements DataNodeLifecycleHandlerContract {
  constructor(
    private readonly repository: DataNodeRepositoryContract,
    private readonly grpcClient: DataNodeGrpcClientContract
  ) {}

  async run(): Promise<void> {
    const dataNodes = await this.repository.listAll();

    await Promise.all(dataNodes.map((dataNode) => this.handleDataNode(dataNode)));
  }

  private async handleDataNode(dataNode: DataNode): Promise<void> {
    const now = new Date();

    let nextState = resolveDataNodeStateFromContactSilence(dataNode, now);

    let expectedRevision = dataNode.revision;

    if (shouldCheckDataNodeHealth(dataNode, now)) {
      const healthCheckInput: RecordDataNodeHealthCheckRepositoryInput = {
        id: dataNode.id,

        lastHealthCheckAt: now,

        expectedRevision
      };

      const healthCheckResult = await this.repository.applyHealthCheck(healthCheckInput);

      if (!healthCheckResult) {
        return;
      }

      expectedRevision += 1n;

      nextState = await this.resolveStateFromHealthCheck(dataNode);
    }

    if (nextState === dataNode.state) {
      return;
    }

    const stateUpdateInput: UpdateDataNodeStateRepositoryInput = {
      id: dataNode.id,

      state: nextState,

      expectedRevision
    };

    await this.repository.updateStateIfRevisionUnchanged(stateUpdateInput);
  }

  private async resolveStateFromHealthCheck(dataNode: DataNode): Promise<DataNodeState> {
    const endpoint = mapDataNodeToDataNodeEndpoint(dataNode);

    try {
      const healthSnapshot = await this.grpcClient.checkDataNodeHealth(endpoint);

      const healthState = resolveDataNodeState(healthSnapshot);

      if (healthState === 'active') {
        return 'offline';
      }

      return 'failed';
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      return 'failed';
    }
  }
}

/* exports */

export { DataNodeLifecycleHandler };
export type { DataNodeLifecycleHandlerContract };
