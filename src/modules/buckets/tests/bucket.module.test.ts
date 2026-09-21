import type { PrismaClient } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { BucketController } from '../bucket.http-controller';
import { createBucketModule } from '../bucket.module';
import { BucketRepository } from '../bucket.repository';
import { BucketService } from '../bucket.service';
import { createBucketTaskDefinition, deleteBucketTaskDefinition } from '../bucket.tasks';

/* stub */

class TaskServiceStub implements TaskServiceContract {
  registrations: Array<{ definition: unknown; handler: unknown }> = [];

  getTaskById: TaskServiceContract['getTaskById'] = async () => {
    throw new Error('Unexpected getTaskById call');
  };

  registerHandler: TaskServiceContract['registerHandler'] = (definition, handler) => {
    this.registrations.push({ definition, handler });
  };

  submitTask: TaskServiceContract['submitTask'] = async () => {
    throw new Error('Unexpected submitTask call');
  };

  executeTaskByDefinition: TaskServiceContract['executeTaskByDefinition'] = async () => {
    throw new Error('Unexpected executeTaskByDefinition call');
  };

  executeTaskByDefinitionAndTargets: TaskServiceContract['executeTaskByDefinitionAndTargets'] = async () => {
    throw new Error('Unexpected executeTaskByDefinitionAndTargets call');
  };
}

/* tests */

describe('createBucketModule', () => {
  test('constructs the module surfaces and registers its task handlers', () => {
    const prisma = {} as PrismaClient;
    const taskService = new TaskServiceStub();

    const bucketModule = createBucketModule({ prisma, taskService });

    expect(bucketModule.repository).toBeInstanceOf(BucketRepository);
    expect(bucketModule.service).toBeInstanceOf(BucketService);
    expect(bucketModule.controller).toBeInstanceOf(BucketController);

    expect(taskService.registrations.map(({ definition }) => definition)).toEqual([
      createBucketTaskDefinition,
      deleteBucketTaskDefinition
    ]);
    expect(taskService.registrations.every(({ handler }) => typeof handler === 'function')).toBe(true);
  });
});
