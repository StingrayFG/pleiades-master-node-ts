import { GenericAlreadyExistsError, GenericConflictError } from '@/errors/application.errors';
import type { TaskDefinitionHandler, TaskDefinitionResult, TaskDefinitionTask } from '@/modules/tasks/task.definition';

import type { BucketRepositoryContract } from './bucket.repository';
import type { createBucketTaskDefinition, deleteBucketTaskDefinition } from './bucket.tasks';

/* contract */

type BucketTaskHandlerContract = {
  createBucket: TaskDefinitionHandler<typeof createBucketTaskDefinition>;
  deleteBucket: TaskDefinitionHandler<typeof deleteBucketTaskDefinition>;
};

/* handler */

class BucketTaskHandler implements BucketTaskHandlerContract {
  constructor(private readonly repository: BucketRepositoryContract) {}

  async createBucket(
    task: TaskDefinitionTask<typeof createBucketTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof createBucketTaskDefinition>> {
    try {
      return await this.repository.create({
        id: task.data.bucketId,
        name: task.data.bucketName,

        userId: task.data.userId,

        state: task.data.state,

        revision: task.data.revision
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      // a replayed execution finds the bucket it has already created;
      // the same name owned by another bucket is a real conflict
      const existingBucket = await this.repository.findByName(task.data.userId, task.data.bucketName);

      if (!existingBucket) {
        throw err;
      }

      if (existingBucket.id !== task.data.bucketId) {
        throw new GenericConflictError('Bucket name is already used by another bucket');
      }

      return existingBucket;
    }
  }

  async deleteBucket(
    task: TaskDefinitionTask<typeof deleteBucketTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof deleteBucketTaskDefinition>> {
    return this.repository.deleteById(task.data.bucketId);
  }
}

/* exports */

export { BucketTaskHandler };
export type { BucketTaskHandlerContract };
