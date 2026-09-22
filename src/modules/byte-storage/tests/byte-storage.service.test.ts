import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAbortedError,
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericDataLossError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';

import {
  BYTE_STORAGE_CHECKSUM_ALGORITHM,
  type ByteStorageObject,
  type ByteStorageReference
} from '../byte-storage.domain';
import { calculateByteStorageChecksum } from '../byte-storage.processors';
import type { ByteStorageRepositoryContract } from '../byte-storage.repository';
import { ByteStorageService } from '../byte-storage.service';
import type { DiskByteStorageServiceContract } from '../disk-byte-storage.service';

/* fixtures */

const id = 'blob-test';
const bytes = Buffer.from('stored bytes');
const now = new Date('2026-01-01T00:00:00.000Z');

const reference: ByteStorageReference = {
  id,
  sizeBytes: BigInt(bytes.length),
  checksum: calculateByteStorageChecksum(bytes),
  checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM
};

const pendingObject: ByteStorageObject = {
  ...reference,
  state: 'pending',
  createdAt: now,
  updatedAt: now
};

const activeObject: ByteStorageObject = {
  ...pendingObject,
  state: 'active'
};

const deletingObject: ByteStorageObject = {
  ...pendingObject,
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
  repository.findById.mockResolvedValue(null);
  repository.create.mockResolvedValue(pendingObject);
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

describe('ByteStorageService', () => {
  let repository: jest.Mocked<ByteStorageRepositoryContract>;
  let diskService: jest.Mocked<DiskByteStorageServiceContract>;
  let service: ByteStorageService;

  beforeEach(() => {
    repository = createRepositoryMock();
    diskService = createDiskServiceMock();
    diskService.retrieve.mockRejectedValue(new GenericNotFoundError());
    service = new ByteStorageService(repository, diskService);
  });

  describe('store', () => {
    test('creates pending metadata, writes bytes, and activates a new object', async () => {
      await service.store(id, bytes);

      expect(repository.create).toHaveBeenCalledWith({ ...reference, state: 'pending' });
      expect(diskService.store).toHaveBeenCalledWith(reference, bytes);
      expect(repository.transitionState).toHaveBeenCalledWith({ id, from: 'pending', to: 'active' });
    });

    test('recovers when another writer creates the pending row first', async () => {
      repository.create.mockRejectedValue(new GenericAlreadyExistsError());
      repository.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingObject);

      await expect(service.store(id, bytes)).resolves.toBeUndefined();
      expect(diskService.store).toHaveBeenCalledWith(reference, bytes);
    });

    test('preserves a create conflict when the concurrent row cannot be read', async () => {
      const createError = new GenericAlreadyExistsError();

      repository.create.mockRejectedValue(createError);
      repository.findById.mockResolvedValue(null);

      await expect(service.store(id, bytes)).rejects.toBe(createError);
      expect(diskService.store).not.toHaveBeenCalled();
    });

    test('verifies an existing active payload without rewriting it', async () => {
      repository.findById.mockResolvedValue(activeObject);
      diskService.retrieve.mockResolvedValue(bytes);

      await service.store(id, bytes);

      expect(diskService.retrieve).toHaveBeenCalledWith(reference);
      expect(diskService.store).not.toHaveBeenCalled();
      expect(repository.transitionState).not.toHaveBeenCalled();
    });

    test('rejects an id already associated with different bytes', async () => {
      repository.findById.mockResolvedValue(activeObject);

      await expect(service.store(id, Buffer.from('different'))).rejects.toBeInstanceOf(GenericConflictError);
      expect(diskService.retrieve).not.toHaveBeenCalled();
    });

    test('rejects a store while the object is being deleted', async () => {
      repository.findById.mockResolvedValue(deletingObject);

      await expect(service.store(id, bytes)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    });

    test('activates a pending object with an already valid file without overwriting it', async () => {
      repository.findById.mockResolvedValue(pendingObject);
      diskService.retrieve.mockResolvedValue(bytes);

      await service.store(id, bytes);

      expect(diskService.store).not.toHaveBeenCalled();
      expect(repository.transitionState).toHaveBeenCalledWith({ id, from: 'pending', to: 'active' });
    });

    test('rewrites a missing or corrupt pending payload', async () => {
      repository.findById.mockResolvedValue(pendingObject);
      diskService.retrieve.mockRejectedValueOnce(new GenericDataLossError());

      await service.store(id, bytes);

      expect(diskService.store).toHaveBeenCalledWith(reference, bytes);
    });

    test('preserves unexpected pending-payload read failures', async () => {
      const diskError = new GenericInternalServerError('Disk unavailable');

      repository.findById.mockResolvedValue(pendingObject);
      diskService.retrieve.mockRejectedValue(diskError);

      await expect(service.store(id, bytes)).rejects.toBe(diskError);
      expect(diskService.store).not.toHaveBeenCalled();
    });

    test('reconciles a lost activation race when the current object is active', async () => {
      repository.findById.mockResolvedValueOnce(pendingObject).mockResolvedValueOnce(activeObject);
      repository.transitionState.mockResolvedValue(false);
      diskService.retrieve.mockResolvedValue(bytes);

      await expect(service.store(id, bytes)).resolves.toBeUndefined();
      expect(diskService.retrieve).toHaveBeenCalledTimes(2);
    });

    test('aborts when a lost activation race is not already satisfied', async () => {
      repository.findById.mockResolvedValue(pendingObject);
      repository.transitionState.mockResolvedValue(false);
      diskService.retrieve.mockResolvedValue(bytes);

      await expect(service.store(id, bytes)).rejects.toBeInstanceOf(GenericAbortedError);
    });

    test('aborts when deletion wins the race against pending-object activation', async () => {
      repository.findById.mockResolvedValueOnce(pendingObject).mockResolvedValueOnce(deletingObject);
      repository.transitionState.mockResolvedValue(false);
      diskService.retrieve.mockResolvedValue(bytes);

      await expect(service.store(id, bytes)).rejects.toBeInstanceOf(GenericAbortedError);
      expect(repository.transitionState).toHaveBeenCalledWith({ id, from: 'pending', to: 'active' });
      expect(repository.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('retrieve', () => {
    test('retrieves bytes for an active object', async () => {
      repository.findById.mockResolvedValue(activeObject);
      diskService.retrieve.mockResolvedValue(bytes);

      await expect(service.retrieve(id)).resolves.toBe(bytes);
      expect(diskService.retrieve).toHaveBeenCalledWith(reference);
    });

    test('rejects missing and inactive objects before reading disk', async () => {
      await expect(service.retrieve(id)).rejects.toBeInstanceOf(GenericNotFoundError);

      repository.findById.mockResolvedValue(pendingObject);

      await expect(service.retrieve(id)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
      expect(diskService.retrieve).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    test('treats a missing object as already deleted', async () => {
      await expect(service.delete(id)).resolves.toBeUndefined();
      expect(repository.transitionState).not.toHaveBeenCalled();
      expect(diskService.delete).not.toHaveBeenCalled();
    });

    test.each([pendingObject, activeObject])(
      'marks a $state object deleting and immediately cleans it up',
      async (object) => {
        repository.findById.mockResolvedValue(object);

        await service.delete(id);

        expect(repository.transitionState).toHaveBeenCalledWith({ id, from: object.state, to: 'deleting' });
        expect(diskService.delete).toHaveBeenCalledWith(reference);
        expect(repository.deleteByIdIfState).toHaveBeenCalledWith(id, 'deleting');
      }
    );

    test('retries cleanup for an object already marked deleting', async () => {
      repository.findById.mockResolvedValue(deletingObject);

      await service.delete(id);

      expect(repository.transitionState).not.toHaveBeenCalled();
      expect(diskService.delete).toHaveBeenCalledWith(reference);
    });

    test('treats disappearance after a lost deletion transition as success', async () => {
      repository.findById.mockResolvedValueOnce(activeObject).mockResolvedValueOnce(null);
      repository.transitionState.mockResolvedValue(false);

      await expect(service.delete(id)).resolves.toBeUndefined();
      expect(diskService.delete).not.toHaveBeenCalled();
    });

    test('treats pending-object disappearance after a lost deletion transition as success', async () => {
      repository.findById.mockResolvedValueOnce(pendingObject).mockResolvedValueOnce(null);
      repository.transitionState.mockResolvedValue(false);

      await expect(service.delete(id)).resolves.toBeUndefined();

      expect(repository.transitionState).toHaveBeenCalledWith({ id, from: 'pending', to: 'deleting' });
      expect(repository.findById).toHaveBeenCalledTimes(2);
      expect(diskService.delete).not.toHaveBeenCalled();
    });

    test('aborts when a lost deletion transition leaves another state', async () => {
      repository.findById.mockResolvedValue(activeObject);
      repository.transitionState.mockResolvedValue(false);

      await expect(service.delete(id)).rejects.toBeInstanceOf(GenericAbortedError);
    });

    test('leaves a deleting row for recovery when immediate disk cleanup fails', async () => {
      repository.findById.mockResolvedValue(activeObject);
      diskService.delete.mockRejectedValue(new GenericInternalServerError('Disk unavailable'));

      await expect(service.delete(id)).resolves.toBeUndefined();
      expect(repository.transitionState).toHaveBeenCalled();
      expect(repository.deleteByIdIfState).not.toHaveBeenCalled();
    });
  });
});
