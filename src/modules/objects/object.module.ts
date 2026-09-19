import type { PrismaClient } from '@prisma/client';

import type { BucketServiceContract } from '@/modules/buckets/bucket.service';
import type { ObjectVersionPartRepositoryContract } from '@/modules/object-version-parts/object-version-part.repository';
import type { ObjectVersionPartServiceContract } from '@/modules/object-version-parts/object-version-part.service';
import type { ObjectVersionPartTaskHandlerContract } from '@/modules/object-version-parts/object-version-part.task-handler';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { DeletingObjectVersionCleanupHandler } from './lifecycle/deleting-object-version-cleanup.handler';
import { ObjectLifecycleHandler } from './lifecycle/object.lifecycle-handler';
import { PendingObjectVersionCleanupHandler } from './lifecycle/pending-object-version-cleanup.handler';
import { ObjectController } from './object.http-controller';
import { ObjectRepository } from './object.repository';
import { ObjectService } from './object.service';
import { ObjectTaskHandler } from './object.task-handler';
import { createObjectTaskDefinition } from './object.tasks';

/* contract */

type ObjectModuleDependencies = {
  prisma: PrismaClient;
  taskService: TaskServiceContract;
  bucketService: BucketServiceContract;
  objectVersionPartRepository: ObjectVersionPartRepositoryContract;
  objectVersionPartService: ObjectVersionPartServiceContract;
  objectVersionPartTaskHandler: ObjectVersionPartTaskHandlerContract;
};

type ObjectModule = {
  repository: ObjectRepository;
  service: ObjectService;
  lifecycleHandler: ObjectLifecycleHandler;
  controller: ObjectController;
};

/* module */

const createObjectModule = ({
  prisma,
  taskService,
  bucketService,
  objectVersionPartRepository,
  objectVersionPartService,
  objectVersionPartTaskHandler
}: ObjectModuleDependencies): ObjectModule => {
  const repository = new ObjectRepository(prisma);

  const taskHandler = new ObjectTaskHandler(repository, objectVersionPartTaskHandler);

  taskService.registerHandler(createObjectTaskDefinition, (task) => taskHandler.createObject(task));

  const service = new ObjectService(bucketService, repository, objectVersionPartService, taskService);

  const pendingObjectVersionCleanupHandler = new PendingObjectVersionCleanupHandler(repository);

  const deletingObjectVersionCleanupHandler = new DeletingObjectVersionCleanupHandler(
    repository,
    objectVersionPartRepository
  );

  const lifecycleHandler = new ObjectLifecycleHandler(
    pendingObjectVersionCleanupHandler,
    deletingObjectVersionCleanupHandler
  );

  const controller = new ObjectController(service);

  return {
    repository,
    service,
    lifecycleHandler,
    controller
  };
};

/* exports */

export { createObjectModule };
export type { ObjectModule, ObjectModuleDependencies };
