import { GenericNotFoundError } from '@/errors/application.errors';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import type { BucketRepositoryContract } from './bucket.repository';

/* contract */

type BucketServiceContract = {
  listBuckets(): Promise<Bucket[]>;
  getBucketByName(name: BucketName): Promise<Bucket>;
  ensureBucketExists(name: BucketName): Promise<EnsureBucketExistsResult>;
  deleteBucket(name: BucketName): Promise<Bucket>;
};

/* service */

class BucketService implements BucketServiceContract {
  constructor(private readonly repository: BucketRepositoryContract) {}

  async listBuckets(): Promise<Bucket[]> {
    const buckets = await this.repository.findAll();

    return buckets;
  }

  async getBucketByName(name: BucketName): Promise<Bucket> {
    const bucket = await this.repository.findByName(name);

    if (!bucket) {
      throw new GenericNotFoundError();
    }

    return bucket;
  }

  async ensureBucketExists(bucketName: BucketName): Promise<EnsureBucketExistsResult> {
    const bucketResolution = await this.repository.findOrCreate(bucketName);

    return bucketResolution;
  }

  async deleteBucket(bucketName: BucketName): Promise<Bucket> {
    const bucket = await this.repository.delete(bucketName);

    return bucket;
  }
}

/* exports */

export { BucketService };

export type { BucketServiceContract };
