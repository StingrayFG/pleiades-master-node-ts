import type { FastifyBaseLogger } from 'fastify';

import type { DataNodeLifecycleHandlerContract } from '@/modules/data-nodes/lifecycle/data-node.lifecycle-handler';
import type { ObjectVersionPartLifecycleHandlerContract } from '@/modules/object-version-parts/lifecycle/object-version-part.lifecycle-handler';
import type { ObjectLifecycleHandlerContract } from '@/modules/objects/lifecycle/object.lifecycle-handler';

import { DataNodeLifecycleWorker } from './data-node-lifecycle.worker';
import { ObjectLifecycleWorker } from './object-lifecycle.worker';
import { ObjectVersionPartLifecycleWorker } from './object-version-part-lifecycle.worker';

/* contract */

type BackgroundModuleDependencies = {
  dataNodeLifecycleHandler: DataNodeLifecycleHandlerContract;
  objectVersionPartLifecycleHandler: ObjectVersionPartLifecycleHandlerContract;
  objectLifecycleHandler: ObjectLifecycleHandlerContract;
  logger: FastifyBaseLogger;
};

type BackgroundModule = {
  dataNodeLifecycleWorker: DataNodeLifecycleWorker;
  objectVersionPartLifecycleWorker: ObjectVersionPartLifecycleWorker;
  objectLifecycleWorker: ObjectLifecycleWorker;
};

/* module */

const createBackgroundModule = ({
  dataNodeLifecycleHandler,
  objectVersionPartLifecycleHandler,
  objectLifecycleHandler,
  logger
}: BackgroundModuleDependencies): BackgroundModule => {
  const dataNodeLifecycleWorker = new DataNodeLifecycleWorker(dataNodeLifecycleHandler, logger);

  const objectVersionPartLifecycleWorker = new ObjectVersionPartLifecycleWorker(
    objectVersionPartLifecycleHandler,
    logger
  );

  const objectLifecycleWorker = new ObjectLifecycleWorker(objectLifecycleHandler, logger);

  return {
    dataNodeLifecycleWorker,
    objectVersionPartLifecycleWorker,
    objectLifecycleWorker
  };
};

/* exports */

export { createBackgroundModule };
export type { BackgroundModule, BackgroundModuleDependencies };
