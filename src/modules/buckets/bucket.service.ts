import { GenericNotFoundError } from '@/errors/application.errors';

import type { EnsureBucketExistsResult } from './bucket.application';
import type { Bucket, BucketName } from './bucket.domain';
import type { BucketRepositoryContract } from './bucket.repository';

/**/

type BucketServiceContract = {
  listBuckets(): Promise<Bucket[]>;
  findBucketByName(name: BucketName): Promise<Bucket | null>;
  getBucketByName(name: BucketName): Promise<Bucket>;
  ensureBucketExists(name: BucketName): Promise<EnsureBucketExistsResult>;
  deleteBucket(name: BucketName): Promise<Bucket>;
};

/**/

class BucketService implements BucketServiceContract {
  constructor(private readonly repository: BucketRepositoryContract) {}

  async listBuckets(): Promise<Bucket[]> {
    const buckets = await this.repository.findAll();

    return buckets;
  }

  async findBucketByName(name: BucketName): Promise<Bucket | null> {
    const bucket = await this.repository.findByName(name);

    return bucket;
  }

  async getBucketByName(name: BucketName): Promise<Bucket> {
    const bucket = await this.repository.findByName(name);

    if (!bucket) {
      throw new GenericNotFoundError();
    }

    return bucket;
  }

  async ensureBucketExists(bucketName: BucketName): Promise<EnsureBucketExistsResult> {
    const bucket = await this.repository.findOrCreate(bucketName);

    return bucket;
  }

  async deleteBucket(bucketName: BucketName): Promise<Bucket> {
    const bucket = await this.repository.delete(bucketName);

    return bucket;
  }
}

/**/

export { BucketService };

export type { BucketServiceContract };
