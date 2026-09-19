import type { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import {
  GenericDataLossError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';

import type { BucketServiceContract } from '@/modules/buckets/bucket.service';
import type { ListPartsByObjectVersionInput } from '@/modules/object-version-parts/object-version-part.application';
import type { Part } from '@/modules/object-version-parts/object-version-part.domain';
import type { ObjectVersionPartServiceContract } from '@/modules/object-version-parts/object-version-part.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type {
  CreateObjectInput,
  CreateObjectResult,
  GetObjectInput,
  GetObjectMetadataInput,
  GetObjectResult
} from './object.application';
import type { ObjectVersion } from './object.domain';
import type { ObjectRepositoryContract } from './object.repository';
import { createObjectTaskDefinition, type CreateObjectTaskData } from './object.tasks';
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
    private readonly objectVersionPartService: ObjectVersionPartServiceContract,
    private readonly taskService: TaskServiceContract
  ) {}

  /* public */

  async getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectVersion> {
    const bucket = await this.bucketService.getBucketByName(input.userId, input.bucketName);

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
      userId: input.userId,

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
    const bucket = await this.bucketService.getBucketByName(input.userId, input.bucketName);

    if (bucket.state !== 'active') {
      throw new GenericFailedPreconditionError('Bucket is not active');
    }

    const taskData: CreateObjectTaskData = {
      objectKey: input.objectKey,
      bucketId: bucket.id,

      totalSizeBytes: input.totalSizeBytes,
      contentType: input.contentType,

      data: await buffer(input.data)
    };

    return this.taskService.executeTaskByDefinition(createObjectTaskDefinition, taskData);
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
