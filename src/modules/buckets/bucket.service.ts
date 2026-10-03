import { randomUUID } from 'node:crypto';

import { GenericNotFoundError } from '@/errors/application.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';
import type { UserId } from '@/modules/users/user.domain';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import type { BucketRepositoryContract } from './bucket.repository';
import { createBucketTaskDefinition, deleteBucketTaskDefinition } from './bucket.tasks';

/* contract */

type BucketServiceContract = {
  listBuckets(userId: UserId): Promise<Bucket[]>;
  getBucketByName(userId: UserId, name: BucketName): Promise<Bucket>;
  ensureBucketExists(userId: UserId, name: BucketName): Promise<EnsureBucketExistsResult>;
  deleteBucket(userId: UserId, name: BucketName): Promise<Bucket>;
};

/* service */

class BucketService implements BucketServiceContract {
  constructor(
    private readonly repository: BucketRepositoryContract,
    private readonly taskService: TaskServiceContract
  ) {}

  async listBuckets(userId: UserId): Promise<Bucket[]> {
    const buckets = await this.repository.listAll(userId);

    return buckets;
  }

  async getBucketByName(userId: UserId, name: BucketName): Promise<Bucket> {
    const bucket = await this.repository.findByName(userId, name);

    if (!bucket) {
      throw new GenericNotFoundError();
    }

    return bucket;
  }

  async ensureBucketExists(userId: UserId, bucketName: BucketName): Promise<EnsureBucketExistsResult> {
    const existingBucket = await this.repository.findByName(userId, bucketName);

    if (existingBucket) {
      return {
        bucket: existingBucket,
        status: 'existing'
      };
    }

    const bucket = await this.taskService.executeTaskByDefinition(createBucketTaskDefinition, {
      bucketId: randomUUID(),
      bucketName,

      userId,

      state: 'active',

      revision: 0n
    });

    return {
      bucket,
      status: 'created'
    };
  }

  async deleteBucket(userId: UserId, bucketName: BucketName): Promise<Bucket> {
    const existingBucket = await this.repository.findByName(userId, bucketName);

    if (!existingBucket) {
      throw new GenericNotFoundError();
    }

    await this.taskService.executeTaskByDefinition(deleteBucketTaskDefinition, {
      bucketId: existingBucket.id,
      bucketName,

      userId
    });

    return existingBucket;
  }
}

/* exports */

export { BucketService };
export type { BucketServiceContract };
