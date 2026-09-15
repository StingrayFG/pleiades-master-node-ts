import type { PrismaClient } from '@prisma/client';

import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { BucketController } from './bucket.http-controller';
import { BucketRepository } from './bucket.repository';
import { BucketTaskHandler } from './bucket.task-handler';
import { BucketService } from './bucket.service';
import { createBucketTaskDefinition, deleteBucketTaskDefinition } from './bucket.tasks';

/* contract */

type BucketModuleDependencies = {
  prisma: PrismaClient;
  taskService: TaskServiceContract;
};

type BucketModule = {
  repository: BucketRepository;
  service: BucketService;
  controller: BucketController;
};

/* module */

const createBucketModule = ({ prisma, taskService }: BucketModuleDependencies): BucketModule => {
  const repository = new BucketRepository(prisma);

  const taskHandler = new BucketTaskHandler(repository);

  taskService.registerHandler(createBucketTaskDefinition, (task) => taskHandler.createBucket(task));
  taskService.registerHandler(deleteBucketTaskDefinition, (task) => taskHandler.deleteBucket(task));

  const service = new BucketService(repository, taskService);

  const controller = new BucketController(service);

  return {
    repository,
    service,
    controller
  };
};

/* exports */

export { createBucketModule };
export type { BucketModule, BucketModuleDependencies };
