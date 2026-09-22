import { Prisma, type ByteStorageObject as PrismaByteStorageObject, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericMapperError } from '@/errors/application.errors';

import { BYTE_STORAGE_CHECKSUM_ALGORITHM, type ByteStorageObject } from '../byte-storage.domain';
import { ByteStorageRepository } from '../byte-storage.repository';

/* fixtures */

const id = 'blob-test';
const now = new Date('2026-01-01T00:00:00.000Z');
const updatedBefore = new Date('2026-01-02T00:00:00.000Z');

const prismaObject: PrismaByteStorageObject = {
  id,
  size_bytes: 12n,
  checksum: 'a'.repeat(64),
  checksum_algorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
  state: 'pending',
  created_at: now,
  updated_at: now
};

const object: ByteStorageObject = {
  id,
  sizeBytes: 12n,
  checksum: 'a'.repeat(64),
  checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
  state: 'pending',
  createdAt: now,
  updatedAt: now
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });

/* mocks */

type ByteStorageDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaByteStorageObject[]>>;
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaByteStorageObject | null>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaByteStorageObject>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  deleteMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

describe('ByteStorageRepository', () => {
  let delegate: ByteStorageDelegateMock;
  let repository: ByteStorageRepository;

  beforeEach(() => {
    delegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaByteStorageObject[]>>().mockResolvedValue([]),
      findUnique: jest.fn<(...args: unknown[]) => Promise<PrismaByteStorageObject | null>>().mockResolvedValue(null),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaByteStorageObject>>().mockResolvedValue(prismaObject),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };

    repository = new ByteStorageRepository({ byteStorageObject: delegate } as unknown as PrismaClient);
  });

  test('lists pending cleanup candidates oldest first', async () => {
    delegate.findMany.mockResolvedValue([prismaObject]);

    await expect(repository.listPendingCleanupCandidates({ updatedBefore, limit: 10 })).resolves.toEqual([object]);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: { state: 'pending', updated_at: { lte: updatedBefore } },
      orderBy: { updated_at: 'asc' },
      take: 10
    });
  });

  test('lists deleting cleanup candidates oldest first', async () => {
    const deletingPrismaObject = { ...prismaObject, state: 'deleting' as const };

    delegate.findMany.mockResolvedValue([deletingPrismaObject]);

    await expect(repository.listDeletingCleanupCandidates({ updatedBefore, limit: 5 })).resolves.toEqual([
      { ...object, state: 'deleting' }
    ]);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: { state: 'deleting', updated_at: { lte: updatedBefore } },
      orderBy: { updated_at: 'asc' },
      take: 5
    });
  });

  test('propagates mapper errors from invalid candidate rows', async () => {
    delegate.findMany.mockResolvedValue([{ ...prismaObject, id: '../invalid' }]);

    await expect(repository.listPendingCleanupCandidates({ updatedBefore, limit: 10 })).rejects.toBeInstanceOf(
      GenericMapperError
    );
  });

  test('finds an object by id and returns null when missing', async () => {
    delegate.findUnique.mockResolvedValueOnce(prismaObject).mockResolvedValueOnce(null);

    await expect(repository.findById(id)).resolves.toEqual(object);
    await expect(repository.findById(id)).resolves.toBeNull();
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id } });
  });

  test('creates storage metadata with explicit state and integrity fields', async () => {
    await expect(
      repository.create({
        id,
        sizeBytes: 12n,
        checksum: 'a'.repeat(64),
        checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
        state: 'pending'
      })
    ).resolves.toEqual(object);
    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        id,
        size_bytes: 12n,
        checksum: 'a'.repeat(64),
        checksum_algorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
        state: 'pending'
      }
    });
  });

  test('maps create uniqueness violations to already-exists errors', async () => {
    delegate.create.mockRejectedValue(createPrismaError('P2002'));

    await expect(
      repository.create({
        id,
        sizeBytes: 12n,
        checksum: 'a'.repeat(64),
        checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
        state: 'pending'
      })
    ).rejects.toBeInstanceOf(GenericAlreadyExistsError);
  });

  test('gates state transitions on the expected source state', async () => {
    await expect(repository.transitionState({ id, from: 'pending', to: 'active' })).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id, state: 'pending' },
      data: { state: 'active' }
    });

    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.transitionState({ id, from: 'pending', to: 'active' })).resolves.toBe(false);
  });

  test('deletes rows only while they remain in the expected state', async () => {
    await expect(repository.deleteByIdIfState(id, 'deleting')).resolves.toBe(true);
    expect(delegate.deleteMany).toHaveBeenCalledWith({ where: { id, state: 'deleting' } });

    delegate.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.deleteByIdIfState(id, 'deleting')).resolves.toBe(false);
  });

  test('preserves unmapped repository failures', async () => {
    const error = new Error('Unexpected repository failure');

    delegate.findUnique.mockRejectedValue(error);

    await expect(repository.findById(id)).rejects.toBe(error);
  });
});
