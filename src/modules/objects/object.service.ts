import type { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import {
  GenericDataLossError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';

import type { BucketServiceContract } from '@/modules/buckets/bucket.service';
import type {
  CreatePartsInput,
  ListPartsByObjectVersionInput
} from '@/modules/object-version-parts/object-version-part.application';
import type { Part } from '@/modules/object-version-parts/object-version-part.domain';
import type { ObjectVersionPartServiceContract } from '@/modules/object-version-parts/object-version-part.service';

import type {
  CommitObjectVersionRepositoryInput,
  CreateObjectInput,
  CreateObjectResult,
  GetObjectInput,
  GetObjectMetadataInput,
  GetObjectResult,
  UpsertObjectAndCreateVersionRepositoryInput
} from './object.application';
import type { ObjectVersion } from './object.domain';
import type { ObjectRepositoryContract } from './object.repository';
import { verifyObjectVersionParts } from './object.verifiers';

/* contract */

type ObjectServiceContract = {
  getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectVersion>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  createObject(input: CreateObjectInput): Promise<CreateObjectResult>;
};

/* service */

class ObjectService implements ObjectServiceContract {
  constructor(
    private readonly bucketService: BucketServiceContract,
    private readonly objectRepository: ObjectRepositoryContract,
    private readonly objectVersionPartService: ObjectVersionPartServiceContract
  ) {}

  /* public */

  async getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectVersion> {
    const bucket = await this.bucketService.getBucketByName(input.bucketName);

    if (bucket.state !== 'active') {
      throw new GenericFailedPreconditionError('Bucket is not active');
    }

    const object = await this.objectRepository.findObjectByKey(bucket.id, input.objectKey);

    if (!object || object.currentVersion === null) {
      throw new GenericNotFoundError();
    }

    if (object.currentVersion > object.lastAllocatedVersion) {
      throw new GenericDataLossError('Current object version is inconsistent');
    }

    const objectVersion = await this.objectRepository.findObjectVersion(object.id, object.currentVersion);

    if (!objectVersion || objectVersion.state !== 'committed' || objectVersion.committedAt === null) {
      throw new GenericDataLossError('Current object version is inconsistent');
    }

    return objectVersion;
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const getObjectMetadataInput: GetObjectMetadataInput = {
      bucketName: input.bucketName,
      objectKey: input.objectKey
    };

    const objectVersion = await this.getObjectMetadata(getObjectMetadataInput);

    const listPartsInput: ListPartsByObjectVersionInput = {
      objectId: objectVersion.objectId,
      version: objectVersion.version
    };

    const parts = await this.objectVersionPartService.listPartsByObjectVersion(listPartsInput);

    verifyObjectVersionParts(objectVersion, parts);

    const data = Readable.from(this.streamPartBytes(parts), {
      objectMode: false
    });

    return {
      objectVersion,
      data
    };
  }

  async createObject(input: CreateObjectInput): Promise<CreateObjectResult> {
    const bucket = await this.bucketService.getBucketByName(input.bucketName);

    if (bucket.state !== 'active') {
      throw new GenericFailedPreconditionError('Bucket is not active');
    }

    const upsertObjectInput: UpsertObjectAndCreateVersionRepositoryInput = {
      bucketId: bucket.id,
      objectKey: input.objectKey,
      totalSizeBytes: input.totalSizeBytes,
      contentType: input.contentType
    };

    const objectVersionAllocation = await this.objectRepository.upsertObjectAndCreateVersion(upsertObjectInput);

    const createPartsInput: CreatePartsInput = {
      objectId: objectVersionAllocation.object.id,
      version: objectVersionAllocation.objectVersion.version,
      totalSizeBytes: input.totalSizeBytes,
      data: input.data
    };

    await this.objectVersionPartService.createPartsFromData(createPartsInput);

    const commitObjectVersionInput: CommitObjectVersionRepositoryInput = {
      objectId: objectVersionAllocation.object.id,
      version: objectVersionAllocation.objectVersion.version
    };

    const objectVersionCommit = await this.objectRepository.commitObjectVersion(commitObjectVersionInput);

    return {
      object: objectVersionCommit.object,
      objectVersion: objectVersionCommit.objectVersion
    };
  }

  /* private */

  private async *streamPartBytes(parts: readonly Part[]): AsyncGenerator<Buffer> {
    for (const part of parts) {
      const blob = await this.objectVersionPartService.getPartBlob(part.blobId);

      yield blob.bytes;
    }
  }
}

/* exports */

export { ObjectService };

export type { ObjectServiceContract };
