import type { Buffer } from 'node:buffer';

import {
  GenericAbortedError,
  GenericAlreadyExistsError,
  GenericDataLossError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';

import type { CreateByteStorageObjectRepositoryInput } from './byte-storage.application';
import {
  BYTE_STORAGE_CHECKSUM_ALGORITHM,
  type ByteStorageId,
  type ByteStorageObject,
  type ByteStorageReference
} from './byte-storage.domain';
import type { DiskByteStorageServiceContract } from './disk-byte-storage.service';
import { mapByteStorageObjectToByteStorageReference } from './byte-storage.mappers';
import { calculateByteStorageChecksum } from './byte-storage.processors';
import type { ByteStorageRepositoryContract } from './byte-storage.repository';
import { verifyExistingByteStorageObject } from './byte-storage.verifiers';

/* contract */

interface ByteStorageServiceContract {
  store(id: ByteStorageId, bytes: Buffer): Promise<void>;
  retrieve(id: ByteStorageId): Promise<Buffer>;
  delete(id: ByteStorageId): Promise<void>;
}

/* service */

class ByteStorageService implements ByteStorageServiceContract {
  constructor(
    private readonly repository: ByteStorageRepositoryContract,
    private readonly diskService: DiskByteStorageServiceContract
  ) {}

  /* public methods */

  async store(id: ByteStorageId, bytes: Buffer): Promise<void> {
    const reference: ByteStorageReference = {
      id,

      sizeBytes: BigInt(bytes.byteLength),
      checksum: calculateByteStorageChecksum(bytes),
      checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM
    };

    let object = await this.repository.findById(id);

    if (!object) {
      const repositoryInput: CreateByteStorageObjectRepositoryInput = {
        ...reference,
        state: 'pending'
      };

      try {
        object = await this.repository.create(repositoryInput);
      } catch (err) {
        if (!(err instanceof GenericAlreadyExistsError)) {
          throw err;
        }

        object = await this.repository.findById(id);

        if (!object) {
          throw err;
        }
      }
    }

    verifyExistingByteStorageObject(object, reference);

    if (object.state === 'active') {
      await this.diskService.retrieve(reference);

      return;
    }

    if (object.state === 'deleting') {
      throw new GenericFailedPreconditionError('The byte storage object is being deleted');
    }

    let shouldWriteBytes = true;

    try {
      await this.diskService.retrieve(reference);
      shouldWriteBytes = false;
    } catch (err) {
      if (!(err instanceof GenericNotFoundError) && !(err instanceof GenericDataLossError)) {
        throw err;
      }
    }

    if (shouldWriteBytes) {
      await this.diskService.store(reference, bytes);
    }

    const transitioned = await this.repository.transitionState({
      id,
      from: 'pending',
      to: 'active'
    });

    if (!transitioned) {
      const currentObject = await this.repository.findById(id);

      if (currentObject?.state === 'active') {
        verifyExistingByteStorageObject(currentObject, reference);

        await this.diskService.retrieve(reference);

        return;
      }

      throw new GenericAbortedError('The byte storage object state changed while storing bytes');
    }
  }

  async retrieve(id: ByteStorageId): Promise<Buffer> {
    const object = await this.requireActiveObject(id);

    return this.diskService.retrieve(mapByteStorageObjectToByteStorageReference(object));
  }

  async delete(id: ByteStorageId): Promise<void> {
    let object = await this.repository.findById(id);

    if (!object) {
      return;
    }

    if (object.state !== 'deleting') {
      const transitioned = await this.repository.transitionState({
        id,
        from: object.state,
        to: 'deleting'
      });

      if (!transitioned) {
        object = await this.repository.findById(id);

        if (!object) {
          return;
        }

        if (object.state !== 'deleting') {
          throw new GenericAbortedError('The byte storage object state changed during deletion');
        }
      }
    }

    // trigger an immediate cleanup attempt to reduce latency;
    // a background sweep will remain responsible for recovery.
    try {
      await this.diskService.delete(mapByteStorageObjectToByteStorageReference(object));
      await this.repository.deleteByIdIfState(id, 'deleting');
    } catch {
      // ignore transient cleanup failures here; the row remains marked as deleting for later recovery.
    }
  }

  /* private methods */

  private async requireActiveObject(id: ByteStorageId): Promise<ByteStorageObject> {
    const object = await this.repository.findById(id);

    if (!object) {
      throw new GenericNotFoundError('Stored bytes were not found');
    }

    if (object.state !== 'active') {
      throw new GenericFailedPreconditionError('Stored bytes are not active');
    }

    return object;
  }
}

/* exports */

export { ByteStorageService };
export type { ByteStorageServiceContract };
