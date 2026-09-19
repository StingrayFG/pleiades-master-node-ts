import type { PrismaClient } from '@prisma/client';

import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import { TaskApplyHandler } from './task.apply-handler';
import type { TaskConfig } from './task.config';
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
};

type TaskModule = {
  repository: TaskRepository;
  applyHandler: TaskApplyHandler;
  service: TaskService;
};

/* module */

const createTaskModule = ({
  prisma,
  taskConfig,
  selfMasterNodeId,
  consensusService,
  byteStorageService
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
    applyHandler,
    resultWaiter,
    selfMasterNodeId,
    taskConfig
  );

  return {
    repository,
    applyHandler,
    service
  };
};

/* exports */

export { createTaskModule };
export type { TaskModule, TaskModuleDependencies };
