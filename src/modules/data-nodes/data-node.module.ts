import type { PrismaClient } from '@prisma/client';

import type { TaskServiceContract } from '@/modules/tasks/task.service';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';

import { DataNodeGrpcClient } from './data-node.grpc-client';
import { DataNodeGrpcController } from './data-node.grpc-controller';
import { DataNodeRepository } from './data-node.repository';
import { DataNodeTaskHandler } from './data-node.task-handler';
import { DataNodeService } from './data-node.service';
import {
  applyDataNodeHeartbeatTaskDefinition,
  recordDataNodeHealthCheckTaskDefinition,
  registerDataNodeTaskDefinition,
  updateDataNodeStateTaskDefinition
} from './data-node.tasks';
import { DataNodeLifecycleHandler } from './lifecycle/data-node.lifecycle-handler';

/* contract */

type DataNodeModuleDependencies = {
  prisma: PrismaClient;
  taskService: TaskServiceContract;
  grpcClientCredentials: GrpcClientCredentialsContract;
};

type DataNodeModule = {
  repository: DataNodeRepository;
  grpcClient: DataNodeGrpcClient;
  service: DataNodeService;
  lifecycleHandler: DataNodeLifecycleHandler;
  controller: DataNodeGrpcController;
};

/* module */

const createDataNodeModule = ({
  prisma,
  taskService,
  grpcClientCredentials
}: DataNodeModuleDependencies): DataNodeModule => {
  const repository = new DataNodeRepository(prisma);

  const grpcClient = new DataNodeGrpcClient(grpcClientCredentials);

  const taskHandler = new DataNodeTaskHandler(repository);

  taskService.registerHandler(registerDataNodeTaskDefinition, (task) => taskHandler.registerDataNode(task));
  taskService.registerHandler(applyDataNodeHeartbeatTaskDefinition, (task) => taskHandler.applyDataNodeHeartbeat(task));
  taskService.registerHandler(recordDataNodeHealthCheckTaskDefinition, (task) =>
    taskHandler.recordDataNodeHealthCheck(task)
  );
  taskService.registerHandler(updateDataNodeStateTaskDefinition, (task) => taskHandler.updateDataNodeState(task));

  const service = new DataNodeService(repository, grpcClient, taskService);

  const lifecycleHandler = new DataNodeLifecycleHandler(repository, grpcClient, taskService);

  const controller = new DataNodeGrpcController(service);

  return {
    repository,
    grpcClient,
    service,
    lifecycleHandler,
    controller
  };
};

/* exports */

export { createDataNodeModule };
export type { DataNodeModule, DataNodeModuleDependencies };
