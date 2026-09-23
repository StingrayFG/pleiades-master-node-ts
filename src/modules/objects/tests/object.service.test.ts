import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericDataLossError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';
import { BLOB_CHECKSUM_ALGORITHM } from '@/modules/blobs/blob.domain';
import type { Bucket } from '@/modules/buckets/bucket.domain';
import type { BucketServiceContract } from '@/modules/buckets/bucket.service';
import type { Part } from '@/modules/object-version-parts/object-version-part.domain';
import type { ObjectVersionPartServiceContract } from '@/modules/object-version-parts/object-version-part.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { Object, ObjectVersion } from '../object.domain';
import type { ObjectRepositoryContract } from '../object.repository';
import { ObjectService } from '../object.service';
import { createObjectTaskDefinition } from '../object.tasks';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const userId = '00000000-0000-4000-8000-000000000001';

const bucket: Bucket = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'test-bucket',
  userId,
  state: 'active',
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const object: Object = {
  id: '00000000-0000-4000-8000-000000000003',
  key: 'path/to/object',
  bucketId: bucket.id,
  currentVersion: 1,
  lastAllocatedVersion: 1,
  createdAt: now,
  updatedAt: now
};

const objectVersion: ObjectVersion = {
  objectId: object.id,
  version: 1,
  state: 'committed',
  totalSizeBytes: 5n,
  contentType: 'application/octet-stream',
  createdAt: now,
  committedAt: now,
  updatedAt: now
};

const parts: Part[] = [
  {
    objectId: object.id,
    version: 1,
    partNumber: 1,
    blobId: '00000000-0000-4000-8000-000000000004',
    placementGroup: 1,
    sizeBytes: 3n,
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue: 'a'.repeat(64),
    createdAt: now
  },
  {
    objectId: object.id,
    version: 1,
    partNumber: 2,
    blobId: '00000000-0000-4000-8000-000000000005',
    placementGroup: 2,
    sizeBytes: 2n,
    checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
    checksumValue: 'b'.repeat(64),
    createdAt: now
  }
];

/* mocks */

const createBucketServiceMock = (): jest.Mocked<BucketServiceContract> => {
  const service = {
    listBuckets: jest.fn<BucketServiceContract['listBuckets']>(),
    getBucketByName: jest.fn<BucketServiceContract['getBucketByName']>(),
    ensureBucketExists: jest.fn<BucketServiceContract['ensureBucketExists']>(),
    deleteBucket: jest.fn<BucketServiceContract['deleteBucket']>()
  };

  service.getBucketByName.mockResolvedValue(bucket);

  return service;
};

const createRepositoryMock = (): jest.Mocked<ObjectRepositoryContract> => {
  const repository = {
    listObjectVersions: jest.fn<ObjectRepositoryContract['listObjectVersions']>(),
    listPendingObjectVersionCleanupCandidates:
      jest.fn<ObjectRepositoryContract['listPendingObjectVersionCleanupCandidates']>(),
    listDeletingObjectVersionCleanupCandidates:
      jest.fn<ObjectRepositoryContract['listDeletingObjectVersionCleanupCandidates']>(),
    findObjectById: jest.fn<ObjectRepositoryContract['findObjectById']>(),
    findObjectByKey: jest.fn<ObjectRepositoryContract['findObjectByKey']>(),
    findObjectVersion: jest.fn<ObjectRepositoryContract['findObjectVersion']>(),
    upsertObjectAndCreateVersion: jest.fn<ObjectRepositoryContract['upsertObjectAndCreateVersion']>(),
    claimObjectVersionCleanup: jest.fn<ObjectRepositoryContract['claimObjectVersionCleanup']>(),
    commitObjectVersion: jest.fn<ObjectRepositoryContract['commitObjectVersion']>(),
    touchObjectVersionDeletionCandidate: jest.fn<ObjectRepositoryContract['touchObjectVersionDeletionCandidate']>(),
    deleteObjectVersionIfDeletingAndPartsGone:
      jest.fn<ObjectRepositoryContract['deleteObjectVersionIfDeletingAndPartsGone']>()
  };

  repository.findObjectByKey.mockResolvedValue(object);
  repository.findObjectVersion.mockResolvedValue(objectVersion);

  return repository;
};

const createPartServiceMock = (): jest.Mocked<ObjectVersionPartServiceContract> => {
  const service = {
    listPartsByObjectVersion: jest.fn<ObjectVersionPartServiceContract['listPartsByObjectVersion']>(),
    getPartBlob: jest.fn<ObjectVersionPartServiceContract['getPartBlob']>()
  };

  service.listPartsByObjectVersion.mockResolvedValue(parts);
  service.getPartBlob
    .mockResolvedValueOnce({ ...parts[0], bytes: Buffer.from('abc') })
    .mockResolvedValueOnce({ ...parts[1], bytes: Buffer.from('de') });

  return service;
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    getTaskById: jest.fn<TaskServiceContract['getTaskById']>(),
    registerHandler: jest.fn<TaskServiceContract['registerHandler']>(),
    submitTask: jest.fn<TaskServiceContract['submitTask']>(),
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>(),
    executeTaskByDefinitionAndTargets: jest.fn<TaskServiceContract['executeTaskByDefinitionAndTargets']>()
  } as unknown as jest.Mocked<TaskServiceContract>;
};

/* tests */

describe('ObjectService', () => {
  let bucketService: jest.Mocked<BucketServiceContract>;
  let repository: jest.Mocked<ObjectRepositoryContract>;
  let partService: jest.Mocked<ObjectVersionPartServiceContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: ObjectService;

  beforeEach(() => {
    bucketService = createBucketServiceMock();
    repository = createRepositoryMock();
    partService = createPartServiceMock();
    taskService = createTaskServiceMock();
    service = new ObjectService(bucketService, repository, partService, taskService);
  });

  test('returns committed current-version metadata', async () => {
    await expect(service.getObjectMetadata({ userId, bucketName: bucket.name, objectKey: object.key })).resolves.toBe(
      objectVersion
    );

    expect(repository.findObjectByKey).toHaveBeenCalledWith(bucket.id, object.key);
    expect(repository.findObjectVersion).toHaveBeenCalledWith(object.id, object.currentVersion!);
  });

  test('rejects reads from inactive buckets', async () => {
    bucketService.getBucketByName.mockResolvedValue({ ...bucket, state: 'deleting' });

    await expect(
      service.getObjectMetadata({ userId, bucketName: bucket.name, objectKey: object.key })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(repository.findObjectByKey).not.toHaveBeenCalled();
  });

  test.each([null, { ...object, currentVersion: null }])(
    'returns not found when no current object exists',
    async (value) => {
      repository.findObjectByKey.mockResolvedValue(value);

      await expect(
        service.getObjectMetadata({ userId, bucketName: bucket.name, objectKey: object.key })
      ).rejects.toBeInstanceOf(GenericNotFoundError);
    }
  );

  test('rejects a current version beyond the last allocated version', async () => {
    repository.findObjectByKey.mockResolvedValue({ ...object, currentVersion: 2, lastAllocatedVersion: 1 });

    await expect(
      service.getObjectMetadata({ userId, bucketName: bucket.name, objectKey: object.key })
    ).rejects.toBeInstanceOf(GenericDataLossError);
  });

  test.each([
    null,
    { ...objectVersion, state: 'pending' as const, committedAt: null },
    { ...objectVersion, committedAt: null }
  ])('rejects inconsistent current-version metadata', async (value) => {
    repository.findObjectVersion.mockResolvedValue(value);

    await expect(
      service.getObjectMetadata({ userId, bucketName: bucket.name, objectKey: object.key })
    ).rejects.toBeInstanceOf(GenericDataLossError);
  });

  test('streams verified part bytes in part order', async () => {
    const result = await service.getObject({ userId, bucketName: bucket.name, objectKey: object.key });

    await expect(buffer(result.data)).resolves.toEqual(Buffer.from('abcde'));
    expect(partService.getPartBlob).toHaveBeenNthCalledWith(1, parts[0].blobId);
    expect(partService.getPartBlob).toHaveBeenNthCalledWith(2, parts[1].blobId);
  });

  test('rejects inconsistent parts before reading their blobs', async () => {
    partService.listPartsByObjectVersion.mockResolvedValue([{ ...parts[0], partNumber: 2 }]);

    await expect(service.getObject({ userId, bucketName: bucket.name, objectKey: object.key })).rejects.toBeInstanceOf(
      GenericDataLossError
    );
    expect(partService.getPartBlob).not.toHaveBeenCalled();
  });

  test('buffers input data and submits object creation through the task service', async () => {
    const result = { object, objectVersion };

    taskService.executeTaskByDefinition.mockResolvedValue(result);

    await expect(
      service.createObject({
        userId,
        bucketName: bucket.name,
        objectKey: object.key,
        totalSizeBytes: 5n,
        contentType: objectVersion.contentType,
        data: Readable.from([Buffer.from('abc'), Buffer.from('de')])
      })
    ).resolves.toBe(result);

    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(createObjectTaskDefinition, {
      objectKey: object.key,
      bucketId: bucket.id,
      totalSizeBytes: 5n,
      contentType: objectVersion.contentType,
      data: Buffer.from('abcde')
    });
  });

  test('rejects object creation in inactive buckets', async () => {
    bucketService.getBucketByName.mockResolvedValue({ ...bucket, state: 'deleting' });

    await expect(
      service.createObject({
        userId,
        bucketName: bucket.name,
        objectKey: object.key,
        totalSizeBytes: 5n,
        contentType: objectVersion.contentType,
        data: Readable.from([Buffer.from('abc')])
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });
});
