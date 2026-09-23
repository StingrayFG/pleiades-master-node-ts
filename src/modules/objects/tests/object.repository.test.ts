import type { Object as PrismaObject, ObjectVersion as PrismaObjectVersion, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericDataLossError, GenericFailedPreconditionError, GenericMapperError } from '@/errors/application.errors';

import type { Object, ObjectVersion } from '../object.domain';
import { ObjectRepository } from '../object.repository';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const objectId = '00000000-0000-4000-8000-000000000001';
const bucketId = '00000000-0000-4000-8000-000000000002';

const prismaObject: PrismaObject = {
  id: objectId,
  key: 'path/to/object',
  bucket_id: bucketId,
  current_version: 1,
  last_allocated_version: 1,
  created_at: now,
  updated_at: now
};

const object: Object = {
  id: prismaObject.id,
  key: prismaObject.key,
  bucketId: prismaObject.bucket_id,
  currentVersion: prismaObject.current_version,
  lastAllocatedVersion: prismaObject.last_allocated_version,
  createdAt: prismaObject.created_at,
  updatedAt: prismaObject.updated_at
};

const prismaVersion: PrismaObjectVersion = {
  object_id: objectId,
  version: 1,
  state: 'committed',
  total_size_bytes: 5n,
  content_type: 'application/octet-stream',
  created_at: now,
  committed_at: now,
  updated_at: now
};

const objectVersion: ObjectVersion = {
  objectId: prismaVersion.object_id,
  version: prismaVersion.version,
  state: prismaVersion.state,
  totalSizeBytes: prismaVersion.total_size_bytes,
  contentType: prismaVersion.content_type,
  createdAt: prismaVersion.created_at,
  committedAt: prismaVersion.committed_at,
  updatedAt: prismaVersion.updated_at
};

/* mocks */

type ObjectDelegateMock = {
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaObject | null>>;
  upsert: jest.Mock<(...args: unknown[]) => Promise<PrismaObject>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

type ObjectVersionDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersion[]>>;
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersion | null>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersion>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  deleteMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

describe('ObjectRepository', () => {
  let objectDelegate: ObjectDelegateMock;
  let versionDelegate: ObjectVersionDelegateMock;
  let queryRaw: jest.Mock<(...args: unknown[]) => Promise<Array<{ id: string }>>>;
  let repository: ObjectRepository;

  beforeEach(() => {
    objectDelegate = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<PrismaObject | null>>().mockResolvedValue(prismaObject),
      upsert: jest.fn<(...args: unknown[]) => Promise<PrismaObject>>().mockResolvedValue(prismaObject),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    versionDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaObjectVersion[]>>().mockResolvedValue([]),
      findUnique: jest
        .fn<(...args: unknown[]) => Promise<PrismaObjectVersion | null>>()
        .mockResolvedValue(prismaVersion),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaObjectVersion>>().mockResolvedValue(prismaVersion),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    queryRaw = jest.fn<(...args: unknown[]) => Promise<Array<{ id: string }>>>().mockResolvedValue([{ id: bucketId }]);

    const tx = {
      object: objectDelegate,
      objectVersion: versionDelegate,
      $queryRaw: queryRaw
    };
    const transaction = jest.fn(async (action: (transactionClient: typeof tx) => Promise<unknown>) => action(tx));

    repository = new ObjectRepository({
      object: objectDelegate,
      objectVersion: versionDelegate,
      $transaction: transaction
    } as unknown as PrismaClient);
  });

  test('lists object versions newest first', async () => {
    versionDelegate.findMany.mockResolvedValue([prismaVersion]);

    await expect(repository.listObjectVersions(objectId)).resolves.toEqual([objectVersion]);
    expect(versionDelegate.findMany).toHaveBeenCalledWith({
      where: { object_id: objectId },
      orderBy: { version: 'desc' }
    });
  });

  test('lists pending and deleting cleanup candidates using their lifecycle gates', async () => {
    const updatedBefore = new Date('2026-01-02T00:00:00.000Z');

    await repository.listPendingObjectVersionCleanupCandidates({ updatedBefore, limit: 3 });
    await repository.listDeletingObjectVersionCleanupCandidates({ limit: 4 });

    expect(versionDelegate.findMany).toHaveBeenNthCalledWith(1, {
      where: { state: 'pending', updated_at: { lte: updatedBefore } },
      orderBy: { updated_at: 'asc' },
      take: 3
    });
    expect(versionDelegate.findMany).toHaveBeenNthCalledWith(2, {
      where: { state: 'deleting' },
      orderBy: { updated_at: 'asc' },
      take: 4
    });
  });

  test('finds objects and versions by their domain keys', async () => {
    await expect(repository.findObjectById(objectId)).resolves.toEqual(object);
    await expect(repository.findObjectByKey(bucketId, object.key)).resolves.toEqual(object);
    await expect(repository.findObjectVersion(objectId, 1)).resolves.toEqual(objectVersion);

    expect(objectDelegate.findUnique).toHaveBeenNthCalledWith(1, { where: { id: objectId } });
    expect(objectDelegate.findUnique).toHaveBeenNthCalledWith(2, {
      where: { bucket_id_key: { bucket_id: bucketId, key: object.key } }
    });
    expect(versionDelegate.findUnique).toHaveBeenCalledWith({
      where: { object_id_version: { object_id: objectId, version: 1 } }
    });
  });

  test('allocates the next pending version while locking an active bucket', async () => {
    const pendingPrismaVersion = { ...prismaVersion, state: 'pending' as const, committed_at: null };

    versionDelegate.create.mockResolvedValue(pendingPrismaVersion);

    await expect(
      repository.upsertObjectAndCreateVersion({
        objectKey: object.key,
        bucketId,
        totalSizeBytes: 5n,
        contentType: objectVersion.contentType
      })
    ).resolves.toEqual({ object, objectVersion: { ...objectVersion, state: 'pending', committedAt: null } });

    expect(queryRaw).toHaveBeenCalled();
    expect(objectDelegate.upsert).toHaveBeenCalledWith({
      where: { bucket_id_key: { bucket_id: bucketId, key: object.key } },
      create: { key: object.key, bucket_id: bucketId, last_allocated_version: 1 },
      update: { last_allocated_version: { increment: 1 } }
    });
    expect(versionDelegate.create).toHaveBeenCalledWith({
      data: {
        object_id: objectId,
        version: prismaObject.last_allocated_version,
        state: 'pending',
        total_size_bytes: 5n,
        content_type: objectVersion.contentType
      }
    });
  });

  test('rejects version allocation when the bucket is not active', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      repository.upsertObjectAndCreateVersion({
        objectKey: object.key,
        bucketId,
        totalSizeBytes: 5n,
        contentType: objectVersion.contentType
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(objectDelegate.upsert).not.toHaveBeenCalled();
  });

  test('commits a pending version and advances the object current version', async () => {
    await expect(repository.commitObjectVersion({ objectId, version: 1 })).resolves.toEqual({ object, objectVersion });

    expect(versionDelegate.updateMany).toHaveBeenCalledWith({
      where: { object_id: objectId, version: 1, state: 'pending' },
      data: { state: 'committed', committed_at: expect.any(Date) }
    });
    expect(objectDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: objectId,
        OR: [{ current_version: null }, { current_version: { lt: 1 } }]
      },
      data: { current_version: 1 }
    });
  });

  test('returns the existing newer current version when committing an older version', async () => {
    const objectWithNewerCurrentVersion = {
      ...prismaObject,
      current_version: 2,
      last_allocated_version: 2
    };

    objectDelegate.updateMany.mockResolvedValue({ count: 0 });
    objectDelegate.findUnique.mockResolvedValue(objectWithNewerCurrentVersion);

    await expect(repository.commitObjectVersion({ objectId, version: 1 })).resolves.toEqual({
      object: {
        ...object,
        currentVersion: 2,
        lastAllocatedVersion: 2
      },
      objectVersion
    });

    expect(objectDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: objectId,
        OR: [{ current_version: null }, { current_version: { lt: 1 } }]
      },
      data: { current_version: 1 }
    });
  });

  test('distinguishes a non-pending version from a disappeared version during commit', async () => {
    versionDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.commitObjectVersion({ objectId, version: 1 })).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );

    versionDelegate.findUnique.mockResolvedValue(null);

    await expect(repository.commitObjectVersion({ objectId, version: 1 })).rejects.toBeInstanceOf(GenericDataLossError);
  });

  test('gates cleanup claims, touches, and deletion on lifecycle state', async () => {
    const key = { objectId, version: 1 };
    const updatedBefore = new Date('2026-01-02T00:00:00.000Z');

    await expect(repository.claimObjectVersionCleanup({ ...key, updatedBefore })).resolves.toBe(true);
    await expect(repository.touchObjectVersionDeletionCandidate(key)).resolves.toBe(true);
    await expect(repository.deleteObjectVersionIfDeletingAndPartsGone(key)).resolves.toBe(true);

    expect(versionDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: { object_id: objectId, version: 1, state: 'pending', updated_at: { lte: updatedBefore } },
      data: { state: 'deleting' }
    });
    expect(versionDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { object_id: objectId, version: 1, state: 'deleting' },
      data: { state: 'deleting' }
    });
    expect(versionDelegate.deleteMany).toHaveBeenCalledWith({
      where: { object_id: objectId, version: 1, state: 'deleting', parts: { none: {} } }
    });
  });

  test('propagates mapper errors from invalid Prisma rows', async () => {
    versionDelegate.findMany.mockResolvedValue([{ ...prismaVersion, version: 0 }]);

    await expect(repository.listObjectVersions(objectId)).rejects.toBeInstanceOf(GenericMapperError);
  });
});
