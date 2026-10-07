import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericFailedPreconditionError, GenericInternalServerError } from '@/errors/application.errors';
import type { ObjectVersionPartTaskHandlerContract } from '@/modules/object-version-parts/object-version-part.task-handler';

import type { Object, ObjectVersion } from '../object.domain';
import type { ObjectRepositoryContract } from '../object.repository';
import { ObjectTaskHandler } from '../object.task-handler';
import type { CreateObjectTask } from '../object.tasks';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const object: Object = {
  id: '00000000-0000-4000-8000-000000000001',
  key: 'path/to/object',
  bucketId: '00000000-0000-4000-8000-000000000002',
  currentVersion: null,
  lastAllocatedVersion: 1,
  createdAt: now,
  updatedAt: now
};

const pendingVersion: ObjectVersion = {
  objectId: object.id,
  version: 1,
  state: 'pending',
  totalSizeBytes: 5n,
  contentType: 'application/octet-stream',
  createdAt: now,
  committedAt: null,
  updatedAt: now
};

const committedObject = { ...object, currentVersion: 1 };
const committedVersion = { ...pendingVersion, state: 'committed' as const, committedAt: now };

const task: CreateObjectTask = {
  id: '00000000-0000-4000-8000-000000000003',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 1n,
  sequence: 1n,
  state: 'pending',
  revision: 0n,
  type: 'object.create',
  executionScope: 'cluster',
  data: {
    objectKey: object.key,
    bucketId: object.bucketId,
    totalSizeBytes: 5n,
    contentType: pendingVersion.contentType,
    data: Buffer.from('abcde')
  }
};

/* mocks */

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

  repository.upsertObjectAndCreateVersion.mockResolvedValue({ object, objectVersion: pendingVersion });
  repository.commitObjectVersion.mockResolvedValue({ object: committedObject, objectVersion: committedVersion });
  repository.findObjectById.mockResolvedValue(committedObject);
  repository.findObjectVersion.mockResolvedValue(committedVersion);

  return repository;
};

const createPartTaskHandlerMock = (): jest.Mocked<ObjectVersionPartTaskHandlerContract> => ({
  createPartsFromData: jest.fn<ObjectVersionPartTaskHandlerContract['createPartsFromData']>().mockResolvedValue([])
});

/* tests */

describe('ObjectTaskHandler', () => {
  let repository: jest.Mocked<ObjectRepositoryContract>;
  let partTaskHandler: jest.Mocked<ObjectVersionPartTaskHandlerContract>;
  let handler: ObjectTaskHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    partTaskHandler = createPartTaskHandlerMock();
    handler = new ObjectTaskHandler(repository, partTaskHandler);
  });

  test('allocates a version, creates parts, and commits it', async () => {
    await expect(handler.createObject(task)).resolves.toEqual({
      object: committedObject,
      objectVersion: committedVersion
    });

    expect(repository.upsertObjectAndCreateVersion).toHaveBeenCalledWith({
      objectKey: object.key,
      bucketId: object.bucketId,
      totalSizeBytes: pendingVersion.totalSizeBytes,
      contentType: pendingVersion.contentType
    });
    expect(partTaskHandler.createPartsFromData).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: object.id,
        version: pendingVersion.version,
        totalSizeBytes: pendingVersion.totalSizeBytes,
        data: expect.anything()
      })
    );
    expect(repository.commitObjectVersion).toHaveBeenCalledWith({
      objectId: object.id,
      version: pendingVersion.version
    });
  });

  test('reconstructs a successful replay after a lost commit transition', async () => {
    repository.commitObjectVersion.mockRejectedValue(new GenericFailedPreconditionError());

    await expect(handler.createObject(task)).resolves.toEqual({
      object: committedObject,
      objectVersion: committedVersion
    });
  });

  test('preserves the commit error when replayed state cannot be found', async () => {
    const commitError = new GenericFailedPreconditionError('not pending');

    repository.commitObjectVersion.mockRejectedValue(commitError);
    repository.findObjectById.mockResolvedValue(null);

    await expect(handler.createObject(task)).rejects.toBe(commitError);
  });

  test('does not reconcile non-precondition commit errors', async () => {
    const commitError = new GenericInternalServerError('database failed');

    repository.commitObjectVersion.mockRejectedValue(commitError);

    await expect(handler.createObject(task)).rejects.toBe(commitError);
    expect(repository.findObjectById).not.toHaveBeenCalled();
  });

  test('does not attempt a commit when part creation fails', async () => {
    const partsError = new Error('part creation failed');

    partTaskHandler.createPartsFromData.mockRejectedValue(partsError);

    await expect(handler.createObject(task)).rejects.toBe(partsError);
    expect(repository.commitObjectVersion).not.toHaveBeenCalled();
  });
});
