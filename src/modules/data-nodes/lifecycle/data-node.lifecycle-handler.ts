import { InternodeApplicationError } from '@/errors/internode.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { DataNode, DataNodeState } from '../data-node.domain';
import { resolveDataNodeState } from '../data-node.domain-policies';
import type { DataNodeGrpcClientContract } from '../data-node.grpc-client';
import { mapDataNodeToDataNodeEndpoint } from '../data-node.mappers';
import type { DataNodeRepositoryContract } from '../data-node.repository';
import {
  recordDataNodeHealthCheckTaskDefinition,
  updateDataNodeStateTaskDefinition,
  type RecordDataNodeHealthCheckTaskData,
  type UpdateDataNodeStateTaskData
} from '../data-node.tasks';
import { resolveDataNodeStateFromContactSilence, shouldCheckDataNodeHealth } from './data-node.lifecycle-policies';

/* contract */

type DataNodeLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class DataNodeLifecycleHandler implements DataNodeLifecycleHandlerContract {
  constructor(
    private readonly repository: DataNodeRepositoryContract,
    private readonly grpcClient: DataNodeGrpcClientContract,
    private readonly taskService: TaskServiceContract
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
      const taskData: RecordDataNodeHealthCheckTaskData = {
        id: dataNode.id,

        lastHealthCheckAt: now,

        expectedRevision
      };

      const healthCheckResult = await this.taskService.executeTaskByDefinition(
        recordDataNodeHealthCheckTaskDefinition,
        taskData
      );

      if (healthCheckResult === false) {
        return;
      }

      expectedRevision += 1n;

      nextState = await this.resolveSilentDataNodeStateFromHealthCheck(dataNode);
    }

    if (nextState === dataNode.state) {
      return;
    }

    const taskData: UpdateDataNodeStateTaskData = {
      id: dataNode.id,

      state: nextState,

      expectedRevision
    };

    await this.taskService.executeTaskByDefinition(updateDataNodeStateTaskDefinition, taskData);
  }

  private async resolveSilentDataNodeStateFromHealthCheck(dataNode: DataNode): Promise<DataNodeState> {
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
