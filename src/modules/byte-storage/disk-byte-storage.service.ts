import type { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { hasFileSystemErrorCode } from '@/common/predicates/file-system.predicates';
import {
  GenericBadRequestError,
  GenericDataLossError,
  GenericInternalServerError,
  GenericNotFoundError,
  GenericResourceExhaustedError
} from '@/errors/application.errors';

import {
  BYTE_STORAGE_CHECKSUM_ALGORITHM,
  byteStorageReferenceSchema,
  type ByteStorageReference
} from './byte-storage.domain';
import { calculateByteStorageChecksum } from './byte-storage.processors';
import type { DiskByteStorageConfig } from './disk-byte-storage.config';

/* contract */

type DiskByteStorageServiceContract = {
  store(reference: ByteStorageReference, bytes: Buffer): Promise<void>;
  retrieve(reference: ByteStorageReference): Promise<Buffer>;
  delete(reference: ByteStorageReference): Promise<void>;
  deleteTemporaryFiles(olderThan: Date): Promise<void>;
};

/* helpers */

const isStorageCapacityError = (err: unknown): boolean => {
  return hasFileSystemErrorCode(err, 'ENOSPC') || hasFileSystemErrorCode(err, 'EDQUOT');
};

/* service */

class DiskByteStorageService implements DiskByteStorageServiceContract {
  private readonly temporaryPath: string;
  private readonly payloadPath: string;

  constructor(private readonly config: DiskByteStorageConfig) {
    this.temporaryPath = join(config.rootPath, 'tmp');
    this.payloadPath = join(config.rootPath, 'payloads');
  }

  /* public methods */

  async store(reference: ByteStorageReference, bytes: Buffer): Promise<void> {
    const parsedReference = this.parseReference(reference);

    this.verifyBytes(parsedReference, bytes);

    const temporaryFilePath = join(this.temporaryPath, `${parsedReference.id}.${randomUUID()}`);
    const payloadFilePath = join(this.payloadPath, parsedReference.id);

    try {
      await Promise.all([mkdir(this.temporaryPath, { recursive: true }), mkdir(this.payloadPath, { recursive: true })]);

      await writeFile(temporaryFilePath, bytes, { flag: 'wx' });
      await rename(temporaryFilePath, payloadFilePath);
    } catch (err) {
      await unlink(temporaryFilePath).catch(() => undefined);

      if (isStorageCapacityError(err)) {
        throw new GenericResourceExhaustedError('Byte storage capacity was exhausted', { cause: err });
      }

      throw new GenericInternalServerError('Failed to store bytes on disk', { cause: err });
    }
  }

  async retrieve(reference: ByteStorageReference): Promise<Buffer> {
    const parsedReference = this.parseReference(reference);

    let bytes;

    try {
      bytes = await readFile(join(this.payloadPath, parsedReference.id));
    } catch (err) {
      if (hasFileSystemErrorCode(err, 'ENOENT')) {
        throw new GenericNotFoundError('Stored bytes were not found', { cause: err });
      }

      throw new GenericInternalServerError('Failed to retrieve bytes from disk', { cause: err });
    }

    this.verifyBytes(parsedReference, bytes);

    return bytes;
  }

  async delete(reference: ByteStorageReference): Promise<void> {
    const parsedReference = this.parseReference(reference);

    try {
      await unlink(join(this.payloadPath, parsedReference.id));
    } catch (err) {
      if (hasFileSystemErrorCode(err, 'ENOENT')) {
        return;
      }

      throw new GenericInternalServerError('Failed to delete bytes from disk', { cause: err });
    }
  }

  async deleteTemporaryFiles(olderThan: Date): Promise<void> {
    let temporaryFileNames;

    try {
      temporaryFileNames = await readdir(this.temporaryPath);
    } catch (err) {
      if (hasFileSystemErrorCode(err, 'ENOENT')) {
        return;
      }

      throw new GenericInternalServerError('Failed to list temporary byte storage files', { cause: err });
    }

    for (const fileName of temporaryFileNames) {
      const filePath = join(this.temporaryPath, fileName);

      try {
        const fileStat = await stat(filePath);

        if (!fileStat.isFile() || fileStat.mtimeMs >= olderThan.getTime()) {
          continue;
        }

        await unlink(filePath);
      } catch (err) {
        if (hasFileSystemErrorCode(err, 'ENOENT')) {
          continue;
        }

        throw new GenericInternalServerError('Failed to delete a temporary byte storage file', { cause: err });
      }
    }
  }

  /* private methods */

  private parseReference(reference: ByteStorageReference): ByteStorageReference {
    const referenceResult = byteStorageReferenceSchema.safeParse(reference);

    if (!referenceResult.success) {
      throw new GenericBadRequestError('Invalid byte storage reference', { cause: referenceResult.error });
    }

    return referenceResult.data;
  }

  private verifyBytes(reference: ByteStorageReference, bytes: Buffer): void {
    const sizeBytes = BigInt(bytes.byteLength);
    const checksum = calculateByteStorageChecksum(bytes);

    if (
      sizeBytes !== reference.sizeBytes ||
      reference.checksumAlgorithm !== BYTE_STORAGE_CHECKSUM_ALGORITHM ||
      checksum !== reference.checksum
    ) {
      throw new GenericDataLossError('Stored bytes failed integrity verification');
    }
  }
}

/* exports */

export { DiskByteStorageService };
export type { DiskByteStorageServiceContract };
