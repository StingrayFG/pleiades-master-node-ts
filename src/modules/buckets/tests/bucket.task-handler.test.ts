import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericInternalServerError
} from '@/errors/application.errors';

import type { Bucket } from '../bucket.domain';
import type { BucketRepositoryContract } from '../bucket.repository';
import { BucketTaskHandler } from '../bucket.task-handler';
import type { CreateBucketTask, DeleteBucketTask } from '../bucket.tasks';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const bucketId = '00000000-0000-4000-8000-000000000002';
const taskId = '00000000-0000-4000-8000-000000000003';
const bucketName = 'test-bucket';

const bucket: Bucket = {
  id: bucketId,
  name: bucketName,

  userId,

  state: 'active',

  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),

  revision: 0n
};

const createBucketTask: CreateBucketTask = {
  id: taskId,

  originMasterNodeId: 'master-node-test',
  epoch: 0n,
  sequence: 0n,

  state: 'pending',

  revision: 0n,

  type: 'bucket.create',
  data: {
    bucketId,
    bucketName,

    userId,

    state: 'active',

    revision: 0n
  },
  executionScope: 'cluster'
};

const deleteBucketTask: DeleteBucketTask = {
  id: taskId,

  originMasterNodeId: 'master-node-test',
  epoch: 0n,
  sequence: 0n,

  state: 'pending',

  revision: 0n,

  type: 'bucket.delete',
  data: {
    bucketId,
    bucketName,

    userId
  },
  executionScope: 'cluster'
};

/* mocks */

const createBucketRepositoryMock = (): jest.Mocked<BucketRepositoryContract> => {
  const repository = {
    listAll: jest.fn<BucketRepositoryContract['listAll']>(),
    findByName: jest.fn<BucketRepositoryContract['findByName']>(),
    create: jest.fn<BucketRepositoryContract['create']>(),
    deleteById: jest.fn<BucketRepositoryContract['deleteById']>()
  };

  repository.listAll.mockResolvedValue([]);
  repository.findByName.mockResolvedValue(null);
  repository.create.mockResolvedValue(bucket);
  repository.deleteById.mockResolvedValue(bucket);

  return repository;
};

/* tests */

describe('BucketTaskHandler', () => {
  let repository: jest.Mocked<BucketRepositoryContract>;
  let handler: BucketTaskHandler;

  beforeEach(() => {
    repository = createBucketRepositoryMock();
    handler = new BucketTaskHandler(repository);
  });

  test('creates a bucket from the task data', async () => {
    const result = await handler.createBucket(createBucketTask);

    expect(result).toBe(bucket);
    expect(repository.create).toHaveBeenCalledWith({
      id: bucketId,
      name: bucketName,

      userId,

      state: 'active',

      revision: 0n
    });
    expect(repository.findByName).not.toHaveBeenCalled();
  });

  test('preserves non-duplicate create errors without reconciliation', async () => {
    const createError = new GenericInternalServerError('Database unavailable');

    repository.create.mockRejectedValue(createError);

    await expect(handler.createBucket(createBucketTask)).rejects.toBe(createError);
    expect(repository.findByName).not.toHaveBeenCalled();
  });

  test('returns the existing bucket when the create is replayed', async () => {
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Bucket already exists'));
    repository.findByName.mockResolvedValue(bucket);

    const result = await handler.createBucket(createBucketTask);

    expect(result).toBe(bucket);
    expect(repository.findByName).toHaveBeenCalledWith(userId, bucketName);
  });

  test('throws when the replayed create conflicts with a different bucket', async () => {
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Bucket already exists'));
    repository.findByName.mockResolvedValue({
      ...bucket,
      id: '00000000-0000-4000-8000-000000000099'
    });

    await expect(handler.createBucket(createBucketTask)).rejects.toBeInstanceOf(GenericConflictError);
  });

  test('preserves the create error when an existing bucket cannot be found after a duplicate', async () => {
    const createError = new GenericAlreadyExistsError('Bucket already exists');

    repository.create.mockRejectedValue(createError);

    await expect(handler.createBucket(createBucketTask)).rejects.toBe(createError);
    expect(repository.findByName).toHaveBeenCalledWith(userId, bucketName);
  });

  test('deletes a bucket using the task bucket id', async () => {
    const result = await handler.deleteBucket(deleteBucketTask);

    expect(result).toBe(bucket);
    expect(repository.deleteById).toHaveBeenCalledWith(bucketId);
  });

  test('returns null when a repeated delete no longer finds the bucket', async () => {
    repository.deleteById.mockResolvedValue(null);

    const result = await handler.deleteBucket(deleteBucketTask);

    expect(result).toBeNull();
    expect(repository.deleteById).toHaveBeenCalledWith(bucketId);
  });
});
