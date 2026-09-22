import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';

import type { ByteStorageConfig } from '../byte-storage.config';
import { BYTE_STORAGE_CHECKSUM_ALGORITHM, type ByteStorageObject } from '../byte-storage.domain';
import type { ByteStorageRepositoryContract } from '../byte-storage.repository';
import type { DiskByteStorageServiceContract } from '../disk-byte-storage.service';
import { ByteStorageLifecycleHandler } from '../lifecycle/byte-storage.lifecycle-handler';
import { DeletingByteStorageObjectCleanupHandler } from '../lifecycle/deleting-byte-storage-object-cleanup.handler';
import { OrphanedTemporaryFileCleanupHandler } from '../lifecycle/orphaned-temporary-file-cleanup.handler';
import { PendingByteStorageObjectCleanupHandler } from '../lifecycle/pending-byte-storage-object-cleanup.handler';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const config: ByteStorageConfig = {
  lifecycle: {
    pendingCleanup: { afterMs: 10_000, batchSize: 3 },
    deletion: { afterMs: 20_000, batchSize: 4 },
    temporaryFileCleanup: { afterMs: 30_000 }
  }
};

const pendingObject: ByteStorageObject = {
  id: 'pending-object',
  sizeBytes: 12n,
  checksum: 'a'.repeat(64),
  checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM,
  state: 'pending',
  createdAt: now,
  updatedAt: now
};

const deletingObject: ByteStorageObject = {
  ...pendingObject,
  id: 'deleting-object',
  state: 'deleting'
};

/* mocks */

const createRepositoryMock = (): jest.Mocked<ByteStorageRepositoryContract> => {
  const repository = {
    listPendingCleanupCandidates: jest.fn<ByteStorageRepositoryContract['listPendingCleanupCandidates']>(),
    listDeletingCleanupCandidates: jest.fn<ByteStorageRepositoryContract['listDeletingCleanupCandidates']>(),
    findById: jest.fn<ByteStorageRepositoryContract['findById']>(),
    create: jest.fn<ByteStorageRepositoryContract['create']>(),
    transitionState: jest.fn<ByteStorageRepositoryContract['transitionState']>(),
    deleteByIdIfState: jest.fn<ByteStorageRepositoryContract['deleteByIdIfState']>()
  };

  repository.listPendingCleanupCandidates.mockResolvedValue([]);
  repository.listDeletingCleanupCandidates.mockResolvedValue([]);
  repository.transitionState.mockResolvedValue(true);
  repository.deleteByIdIfState.mockResolvedValue(true);

  return repository;
};

const createDiskServiceMock = (): jest.Mocked<DiskByteStorageServiceContract> => ({
  store: jest.fn<DiskByteStorageServiceContract['store']>(),
  retrieve: jest.fn<DiskByteStorageServiceContract['retrieve']>(),
  delete: jest.fn<DiskByteStorageServiceContract['delete']>(),
  deleteTemporaryFiles: jest.fn<DiskByteStorageServiceContract['deleteTemporaryFiles']>()
});

/* tests */

describe('byte storage lifecycle handlers', () => {
  let repository: jest.Mocked<ByteStorageRepositoryContract>;
  let diskService: jest.Mocked<DiskByteStorageServiceContract>;

  beforeEach(() => {
    repository = createRepositoryMock();
    diskService = createDiskServiceMock();
  });

  test('directly deletes files and rows for stale pending objects without transitioning their state', async () => {
    repository.listPendingCleanupCandidates.mockResolvedValue([
      pendingObject,
      { ...pendingObject, id: 'active-object', state: 'active' }
    ]);
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    await handler.run(now);

    expect(repository.listPendingCleanupCandidates).toHaveBeenCalledWith({
      updatedBefore: new Date(now.getTime() - config.lifecycle.pendingCleanup.afterMs),
      limit: config.lifecycle.pendingCleanup.batchSize
    });
    expect(diskService.delete).toHaveBeenCalledTimes(1);
    expect(diskService.delete).toHaveBeenCalledWith({
      id: pendingObject.id,
      sizeBytes: pendingObject.sizeBytes,
      checksum: pendingObject.checksum,
      checksumAlgorithm: pendingObject.checksumAlgorithm
    });
    expect(repository.deleteByIdIfState).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(pendingObject.id, 'pending');
    expect(repository.transitionState).not.toHaveBeenCalled();
  });

  test('keeps a pending row when file cleanup fails', async () => {
    repository.listPendingCleanupCandidates.mockResolvedValue([pendingObject]);
    diskService.delete.mockRejectedValue(new GenericInternalServerError('Disk unavailable'));
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).rejects.toBeInstanceOf(GenericInternalServerError);
    expect(repository.deleteByIdIfState).not.toHaveBeenCalled();
  });

  test('ignores a pending row that changed state before cleanup deletion', async () => {
    repository.listPendingCleanupCandidates.mockResolvedValue([pendingObject]);
    repository.deleteByIdIfState.mockResolvedValue(false);
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).resolves.toBeUndefined();

    expect(diskService.delete).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(pendingObject.id, 'pending');
  });

  test('continues cleaning pending objects after another cleanup fails', async () => {
    const secondObject = { ...pendingObject, id: 'second-object' };
    const error = new GenericInternalServerError('Disk unavailable');

    repository.listPendingCleanupCandidates.mockResolvedValue([pendingObject, secondObject]);
    diskService.delete.mockRejectedValueOnce(error).mockResolvedValueOnce();
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).rejects.toBeInstanceOf(GenericInternalServerError);

    expect(diskService.delete).toHaveBeenCalledTimes(2);
    expect(repository.deleteByIdIfState).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(secondObject.id, 'pending');
  });

  test('aggregates failed pending object cleanups with object ids as sources', async () => {
    const secondObject = { ...pendingObject, id: 'second-object' };
    const firstError = new GenericInternalServerError('First failure');
    const secondError = new GenericInternalServerError('Second failure');

    repository.listPendingCleanupCandidates.mockResolvedValue([pendingObject, secondObject]);
    diskService.delete.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: pendingObject.id, error: firstError },
      { source: secondObject.id, error: secondError }
    ]);
  });

  test('aggregates multiple pending cleanup failures while continuing the batch', async () => {
    const secondObject = { ...pendingObject, id: 'second-object' };
    const thirdObject = { ...pendingObject, id: 'third-object' };
    const firstError = new GenericInternalServerError('First failure');
    const secondError = new GenericInternalServerError('Second failure');

    repository.listPendingCleanupCandidates.mockResolvedValue([pendingObject, secondObject, thirdObject]);
    diskService.delete.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError).mockResolvedValueOnce();
    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).rejects.toBeInstanceOf(GenericInternalServerError);

    expect(diskService.delete).toHaveBeenCalledTimes(3);
    expect(repository.deleteByIdIfState).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(thirdObject.id, 'pending');
  });

  test('cleans other pending objects and aggregates per-object failures', async () => {
    const failingObject = { ...pendingObject, id: 'failing-pending-object' };
    const diskError = new GenericInternalServerError('Disk unavailable');

    repository.listPendingCleanupCandidates.mockResolvedValue([failingObject, pendingObject]);
    diskService.delete.mockRejectedValueOnce(diskError);

    const handler = new PendingByteStorageObjectCleanupHandler(repository, diskService, config);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([{ source: failingObject.id, error: diskError }]);
    expect(repository.deleteByIdIfState).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(pendingObject.id, 'pending');
  });

  test('deletes files and rows for stale deleting objects', async () => {
    repository.listDeletingCleanupCandidates.mockResolvedValue([deletingObject]);
    const handler = new DeletingByteStorageObjectCleanupHandler(repository, diskService, config);

    await handler.run(now);

    expect(repository.listDeletingCleanupCandidates).toHaveBeenCalledWith({
      updatedBefore: new Date(now.getTime() - config.lifecycle.deletion.afterMs),
      limit: config.lifecycle.deletion.batchSize
    });
    expect(diskService.delete).toHaveBeenCalledWith({
      id: deletingObject.id,
      sizeBytes: deletingObject.sizeBytes,
      checksum: deletingObject.checksum,
      checksumAlgorithm: deletingObject.checksumAlgorithm
    });
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(deletingObject.id, 'deleting');
  });

  test('keeps a deleting row when file cleanup fails', async () => {
    repository.listDeletingCleanupCandidates.mockResolvedValue([deletingObject]);
    diskService.delete.mockRejectedValue(new GenericInternalServerError('Disk unavailable'));
    const handler = new DeletingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).rejects.toBeInstanceOf(GenericInternalServerError);
    expect(repository.deleteByIdIfState).not.toHaveBeenCalled();
  });

  test('ignores a deleting row that was already removed before cleanup deletion', async () => {
    repository.listDeletingCleanupCandidates.mockResolvedValue([deletingObject]);
    repository.deleteByIdIfState.mockResolvedValue(false);
    const handler = new DeletingByteStorageObjectCleanupHandler(repository, diskService, config);

    await expect(handler.run(now)).resolves.toBeUndefined();

    expect(diskService.delete).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(deletingObject.id, 'deleting');
  });

  test('cleans other deleting objects and aggregates per-object failures', async () => {
    const failingObject = { ...deletingObject, id: 'failing-deleting-object' };
    const diskError = new GenericInternalServerError('Disk unavailable');

    repository.listDeletingCleanupCandidates.mockResolvedValue([failingObject, deletingObject]);
    diskService.delete.mockRejectedValueOnce(diskError);

    const handler = new DeletingByteStorageObjectCleanupHandler(repository, diskService, config);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([{ source: failingObject.id, error: diskError }]);
    expect(repository.deleteByIdIfState).toHaveBeenCalledTimes(1);
    expect(repository.deleteByIdIfState).toHaveBeenCalledWith(deletingObject.id, 'deleting');
  });

  test('asks disk storage to remove temporary files older than the configured threshold', async () => {
    const handler = new OrphanedTemporaryFileCleanupHandler(diskService, config);

    await handler.run(now);

    expect(diskService.deleteTemporaryFiles).toHaveBeenCalledWith(
      new Date(now.getTime() - config.lifecycle.temporaryFileCleanup.afterMs)
    );
  });

  test('propagates temporary file cleanup failures', async () => {
    diskService.deleteTemporaryFiles.mockRejectedValue(new GenericInternalServerError('Disk unavailable'));
    const handler = new OrphanedTemporaryFileCleanupHandler(diskService, config);

    await expect(handler.run(now)).rejects.toBeInstanceOf(GenericInternalServerError);
  });
});

describe('ByteStorageLifecycleHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs all cleanup flows with the same current time', async () => {
    const pendingRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const deletingRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const temporaryRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const handler = new ByteStorageLifecycleHandler(
      { run: pendingRun } as unknown as PendingByteStorageObjectCleanupHandler,
      { run: deletingRun } as unknown as DeletingByteStorageObjectCleanupHandler,
      { run: temporaryRun } as unknown as OrphanedTemporaryFileCleanupHandler
    );

    await handler.run();

    expect(pendingRun).toHaveBeenCalledWith(now);
    expect(deletingRun).toHaveBeenCalledWith(now);
    expect(temporaryRun).toHaveBeenCalledWith(now);
  });

  test('runs every cleanup flow and aggregates their failures', async () => {
    const pendingError = new Error('pending failed');
    const deletingError = new Error('deleting failed');
    const temporaryError = new Error('temporary failed');
    const pendingRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(pendingError);
    const deletingRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(deletingError);
    const temporaryRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(temporaryError);
    const handler = new ByteStorageLifecycleHandler(
      { run: pendingRun } as unknown as PendingByteStorageObjectCleanupHandler,
      { run: deletingRun } as unknown as DeletingByteStorageObjectCleanupHandler,
      { run: temporaryRun } as unknown as OrphanedTemporaryFileCleanupHandler
    );

    let thrown: unknown;

    try {
      await handler.run();
    } catch (err) {
      thrown = err;
    }

    expect(pendingRun).toHaveBeenCalled();
    expect(deletingRun).toHaveBeenCalled();
    expect(temporaryRun).toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: 'pendingCleanup', error: pendingError },
      { source: 'deletion', error: deletingError },
      { source: 'temporaryFileCleanup', error: temporaryError }
    ]);
  });
});
