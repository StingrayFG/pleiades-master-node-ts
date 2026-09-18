import type { FastifyBaseLogger } from 'fastify';

import type { ByteStorageLifecycleHandlerContract } from '@/modules/byte-storage/lifecycle/byte-storage.lifecycle-handler';
import type { DataNodeLifecycleHandlerContract } from '@/modules/data-nodes/lifecycle/data-node.lifecycle-handler';
import type { ObjectVersionPartLifecycleHandlerContract } from '@/modules/object-version-parts/lifecycle/object-version-part.lifecycle-handler';
import type { ObjectLifecycleHandlerContract } from '@/modules/objects/lifecycle/object.lifecycle-handler';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';

import { backgroundConfig } from './background.config';
import type { BackgroundWorkerContract } from './background-worker.contract';
import { IntervalBackgroundWorker } from './interval-background.worker';

/* contract */

type BackgroundModuleDependencies = {
  taskApplyHandler: TaskApplyHandlerContract;
  byteStorageLifecycleHandler: ByteStorageLifecycleHandlerContract;
  dataNodeLifecycleHandler: DataNodeLifecycleHandlerContract;
  objectVersionPartLifecycleHandler: ObjectVersionPartLifecycleHandlerContract;
  objectLifecycleHandler: ObjectLifecycleHandlerContract;
  logger: FastifyBaseLogger;
};

type BackgroundModule = {
  start(): void;
  stop(): Promise<void>;
};

/* helpers */

const createLoggedBackgroundHandler = (
  handler: () => Promise<void>,
  logger: FastifyBaseLogger,
  failureMessage: string
): (() => Promise<void>) => {
  return async () => {
    try {
      await handler();
    } catch (err) {
      logger.error({ err }, failureMessage);
    }
  };
};

/* module */

const createBackgroundModule = ({
  taskApplyHandler,
  byteStorageLifecycleHandler,
  dataNodeLifecycleHandler,
  objectVersionPartLifecycleHandler,
  objectLifecycleHandler,
  logger
}: BackgroundModuleDependencies): BackgroundModule => {
  const taskApplyWorker = new IntervalBackgroundWorker(
    backgroundConfig.worker.taskApplyIntervalMs,
    createLoggedBackgroundHandler(() => taskApplyHandler.run(), logger, 'Task apply sweep failed')
  );

  const byteStorageLifecycleWorker = new IntervalBackgroundWorker(
    backgroundConfig.worker.byteStorageLifecycleIntervalMs,
    createLoggedBackgroundHandler(() => byteStorageLifecycleHandler.run(), logger, 'Byte storage lifecycle sweep failed')
  );

  const dataNodeLifecycleWorker = new IntervalBackgroundWorker(
    backgroundConfig.worker.dataNodeLifecycleIntervalMs,
    createLoggedBackgroundHandler(() => dataNodeLifecycleHandler.run(), logger, 'Data node lifecycle sweep failed')
  );

  const objectVersionPartLifecycleWorker = new IntervalBackgroundWorker(
    backgroundConfig.worker.objectVersionPartLifecycleIntervalMs,
    createLoggedBackgroundHandler(
      () => objectVersionPartLifecycleHandler.run(),
      logger,
      'Object version part lifecycle sweep failed'
    )
  );

  const objectLifecycleWorker = new IntervalBackgroundWorker(
    backgroundConfig.worker.objectLifecycleIntervalMs,
    createLoggedBackgroundHandler(() => objectLifecycleHandler.run(), logger, 'Object lifecycle sweep failed')
  );

  const workers: readonly BackgroundWorkerContract[] = [
    taskApplyWorker,
    byteStorageLifecycleWorker,
    dataNodeLifecycleWorker,
    objectVersionPartLifecycleWorker,
    objectLifecycleWorker
  ];

  const start = (): void => {
    for (const worker of workers) {
      worker.start();
    }
  };

  const stop = async (): Promise<void> => {
    await Promise.all(workers.map((worker) => worker.stop()));
  };

  return {
    start,
    stop
  };
};

/* exports */

export { createBackgroundModule };
export type { BackgroundModule, BackgroundModuleDependencies };
