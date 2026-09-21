import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { bucketIdSchema, type Bucket } from '../bucket.domain';
import type { BucketRepositoryContract } from '../bucket.repository';
import { BucketService } from '../bucket.service';
import {
  createBucketTaskDefinition,
  deleteBucketTaskDefinition,
  type CreateBucketTaskData,
  type DeleteBucketTaskData
} from '../bucket.tasks';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const bucketId = '00000000-0000-4000-8000-000000000002';
const bucketName = 'test-bucket';

const createBucketFixture = (overrides: Partial<Bucket> = {}): Bucket => {
  return {
    id: bucketId,
    name: bucketName,

    userId,

    state: 'active',

    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),

    revision: 0n,

    ...overrides
  };
};

/* mocks */

const createBucketRepositoryMock = (): jest.Mocked<BucketRepositoryContract> => {
  return {
    listAll: jest.fn<BucketRepositoryContract['listAll']>(),
    findByName: jest.fn<BucketRepositoryContract['findByName']>(),
    create: jest.fn<BucketRepositoryContract['create']>(),
    deleteById: jest.fn<BucketRepositoryContract['deleteById']>()
  };
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

describe('BucketService', () => {
  let repository: jest.Mocked<BucketRepositoryContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let service: BucketService;

  beforeEach(() => {
    repository = createBucketRepositoryMock();
    taskService = createTaskServiceMock();

    repository.listAll.mockResolvedValue([]);
    repository.findByName.mockResolvedValue(null);

    service = new BucketService(repository, taskService);
  });

  test('lists buckets belonging to the requested user', async () => {
    const expectedBuckets = [createBucketFixture()];

    repository.listAll.mockResolvedValue(expectedBuckets);

    const buckets = await service.listBuckets(userId);

    expect(buckets).toBe(expectedBuckets);
    expect(repository.listAll).toHaveBeenCalledWith(userId);
  });

  test('returns a bucket found by user and name', async () => {
    const expectedBucket = createBucketFixture();

    repository.findByName.mockResolvedValue(expectedBucket);

    const bucket = await service.getBucketByName(userId, bucketName);

    expect(bucket).toBe(expectedBucket);
    expect(repository.findByName).toHaveBeenCalledWith(userId, bucketName);
  });

  test('throws when a bucket cannot be found', async () => {
    await expect(service.getBucketByName(userId, bucketName)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  test('returns an existing bucket without submitting a task', async () => {
    const existingBucket = createBucketFixture();

    repository.findByName.mockResolvedValue(existingBucket);

    const result = await service.ensureBucketExists(userId, bucketName);

    expect(result).toEqual({
      bucket: existingBucket,
      status: 'existing'
    });
    expect(repository.findByName).toHaveBeenCalledWith(userId, bucketName);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('submits a create task when the bucket does not exist', async () => {
    const createdBucket = createBucketFixture();

    taskService.executeTaskByDefinition.mockResolvedValue(createdBucket);

    const result = await service.ensureBucketExists(userId, bucketName);

    expect(result).toEqual({
      bucket: createdBucket,
      status: 'created'
    });
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(1);

    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    expect(definition).toBe(createBucketTaskDefinition);

    const taskData = data as CreateBucketTaskData;
    expect(() => bucketIdSchema.parse(taskData.bucketId)).not.toThrow();
    expect(taskData.bucketName).toBe(bucketName);
    expect(taskData.userId).toBe(userId);
    expect(taskData.state).toBe('active');
    expect(taskData.revision).toBe(0n);
  });

  test('generates a different bucket ID for each create task', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(createBucketFixture());

    await service.ensureBucketExists(userId, bucketName);
    await service.ensureBucketExists(userId, bucketName);

    expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(2);

    const firstTaskData = taskService.executeTaskByDefinition.mock.calls[0][1] as CreateBucketTaskData;
    const secondTaskData = taskService.executeTaskByDefinition.mock.calls[1][1] as CreateBucketTaskData;

    expect(firstTaskData.bucketId).not.toBe(secondTaskData.bucketId);
  });

  test('propagates a task execution failure', async () => {
    const taskError = new GenericInternalServerError('Task execution failed');

    taskService.executeTaskByDefinition.mockRejectedValue(taskError);

    await expect(service.ensureBucketExists(userId, bucketName)).rejects.toBe(taskError);
  });

  test('throws without submitting a delete task when the bucket does not exist', async () => {
    await expect(service.deleteBucket(userId, bucketName)).rejects.toBeInstanceOf(GenericNotFoundError);
    expect(taskService.executeTaskByDefinition).not.toHaveBeenCalled();
  });

  test('submits a delete task and returns the bucket that was selected for deletion', async () => {
    const existingBucket = createBucketFixture();

    repository.findByName.mockResolvedValue(existingBucket);
    taskService.executeTaskByDefinition.mockResolvedValue(existingBucket);

    const result = await service.deleteBucket(userId, bucketName);

    expect(result).toBe(existingBucket);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledTimes(1);

    const [definition, data] = taskService.executeTaskByDefinition.mock.calls[0];
    expect(definition).toBe(deleteBucketTaskDefinition);
    expect(data as DeleteBucketTaskData).toEqual({
      bucketId,
      bucketName,
      userId
    });
  });
});
