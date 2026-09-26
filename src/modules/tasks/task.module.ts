import type { PrismaClient } from '@prisma/client';

import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import { TaskLifecycleHandler, type TaskLifecycleHandlerContract } from './lifecycle/task.lifecycle-handler';
import { TaskPayloadCleanupHandler } from './lifecycle/task-payload-cleanup.handler';
import { UncommittedTaskCleanupHandler } from './lifecycle/uncommitted-task-cleanup.handler';
import { TaskApplyHandler } from './task.apply-handler';
import type { TaskConfig } from './task.config';
import type { TaskForwarderContract } from './task.forwarder';
import { InMemoryTaskHandlerRegistry } from './task.handler-registry';
import { TaskRepository } from './task.repository';
import { TaskResultWaiter } from './task.result-waiter';
import { TaskService } from './task.service';

/* contract */

type TaskModuleDependencies = {
  prisma: PrismaClient;
  taskConfig: TaskConfig;
  selfMasterNodeId: MasterNodeId;
  consensusService: ConsensusServiceContract;
  byteStorageService: ByteStorageServiceContract;
  taskForwarder: TaskForwarderContract;
};

type TaskModule = {
  repository: TaskRepository;
  applyHandler: TaskApplyHandler;
  service: TaskService;
  lifecycleHandler: TaskLifecycleHandlerContract;
};

/* module */

const createTaskModule = ({
  prisma,
  taskConfig,
  selfMasterNodeId,
  consensusService,
  byteStorageService,
  taskForwarder
}: TaskModuleDependencies): TaskModule => {
  const repository = new TaskRepository(prisma);

  const handlerRegistry = new InMemoryTaskHandlerRegistry();

  const resultWaiter = new TaskResultWaiter();

  const applyHandler = new TaskApplyHandler(
    repository,
    handlerRegistry,
    consensusService,
    byteStorageService,
    resultWaiter,
    selfMasterNodeId,
    taskConfig
  );

  const service = new TaskService(
    repository,
    handlerRegistry,
    consensusService,
    byteStorageService,
    taskForwarder,
    applyHandler,
    resultWaiter,
    selfMasterNodeId,
    taskConfig
  );

  const taskPayloadCleanupHandler = new TaskPayloadCleanupHandler(repository, byteStorageService, taskConfig);

  const uncommittedTaskCleanupHandler = new UncommittedTaskCleanupHandler(repository, consensusService, taskConfig);

  const lifecycleHandler = new TaskLifecycleHandler(uncommittedTaskCleanupHandler, taskPayloadCleanupHandler);

  return {
    repository,
    applyHandler,
    service,
    lifecycleHandler
  };
};

/* exports */

export { createTaskModule };
export type { TaskModule, TaskModuleDependencies };
