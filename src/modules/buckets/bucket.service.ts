import { GenericNotFoundError } from '@/errors/application.errors';
import type { UserId } from '@/modules/users/user.domain';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import type { BucketRepositoryContract } from './bucket.repository';

/* contract */

type BucketServiceContract = {
  listBuckets(userId: UserId): Promise<Bucket[]>;
  getBucketByName(userId: UserId, name: BucketName): Promise<Bucket>;
  ensureBucketExists(userId: UserId, name: BucketName): Promise<EnsureBucketExistsResult>;
  deleteBucket(userId: UserId, name: BucketName): Promise<Bucket>;
};

/* service */

class BucketService implements BucketServiceContract {
  constructor(private readonly repository: BucketRepositoryContract) {}

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
    const bucketResolution = await this.repository.findOrCreate(userId, bucketName);

    return bucketResolution;
  }

  async deleteBucket(userId: UserId, bucketName: BucketName): Promise<Bucket> {
    const bucket = await this.repository.delete(userId, bucketName);

    return bucket;
  }
}

/* exports */

export { BucketService };
export type { BucketServiceContract };
