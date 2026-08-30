import type { FastifyBaseLogger } from 'fastify';

import type { DataNodeLifecycleHandlerContract } from '@/modules/data-nodes/data-node.lifecycle-handler';

import { DataNodeLifecycleWorker } from './data-node-lifecycle.worker';

/* contract */

type BackgroundModuleDependencies = {
  dataNodeLifecycleHandler: DataNodeLifecycleHandlerContract;
  logger: FastifyBaseLogger;
};

type BackgroundModule = {
  dataNodeLifecycleWorker: DataNodeLifecycleWorker;
};

/* module */

const createBackgroundModule = ({
  dataNodeLifecycleHandler,
  logger
}: BackgroundModuleDependencies): BackgroundModule => {
  const dataNodeLifecycleWorker = new DataNodeLifecycleWorker(dataNodeLifecycleHandler, logger);

  return {
    dataNodeLifecycleWorker
  };
};

/* exports */

export { createBackgroundModule };
export type { BackgroundModule, BackgroundModuleDependencies };
