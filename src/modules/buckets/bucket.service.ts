import { GenericNotFoundError } from '@/errors/application.errors';

import type { Bucket, BucketName } from './bucket.domain';
import type { BucketRepositoryContract } from './bucket.repository';
import { EnsureBucketResult } from './bucket.application';

/**/

type BucketServiceContract = {
  findByName(name: BucketName): Promise<Bucket | null>;
  getByName(name: BucketName): Promise<Bucket>;
  ensureExists(name: BucketName): Promise<EnsureBucketResult>;
};

/**/

class BucketService implements BucketServiceContract {
  constructor(private readonly repository: BucketRepositoryContract) {}

  async findByName(name: BucketName): Promise<Bucket | null> {
    const bucket = await this.repository.findByName(name);

    return bucket;
  }

  async getByName(name: BucketName): Promise<Bucket> {
    const bucket = await this.repository.findByName(name);

    if (!bucket) {
      throw new GenericNotFoundError();
    }

    return bucket;
  }

  async ensureExists(bucketName: BucketName): Promise<EnsureBucketResult> {
    const bucket = await this.repository.createIfNotExists(bucketName);

    return bucket;
  }
}

/**/

export { BucketService };

export type { BucketServiceContract };
