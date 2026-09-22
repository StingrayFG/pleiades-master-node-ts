import { Buffer } from 'node:buffer';
import { access, mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import {
  GenericBadRequestError,
  GenericDataLossError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';

import { BYTE_STORAGE_CHECKSUM_ALGORITHM, type ByteStorageReference } from '../byte-storage.domain';
import { calculateByteStorageChecksum } from '../byte-storage.processors';
import { DiskByteStorageService } from '../disk-byte-storage.service';

/* fixtures */

const bytes = Buffer.from('stored bytes');

const reference: ByteStorageReference = {
  id: 'blob-test',
  sizeBytes: BigInt(bytes.length),
  checksum: calculateByteStorageChecksum(bytes),
  checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM
};

/* tests */

describe('DiskByteStorageService', () => {
  let rootPath: string;
  let service: DiskByteStorageService;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'byte-storage-test-'));
    service = new DiskByteStorageService({ rootPath });
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  test('atomically stores and retrieves verified bytes', async () => {
    await service.store(reference, bytes);

    await expect(service.retrieve(reference)).resolves.toEqual(bytes);
    await expect(readdir(join(rootPath, 'tmp'))).resolves.toEqual([]);
    await expect(access(join(rootPath, 'payloads', reference.id))).resolves.toBeUndefined();
  });

  test('rejects invalid references before accessing disk', async () => {
    const invalidReference = {
      ...reference,
      id: '../unsafe'
    } as ByteStorageReference;

    await expect(service.store(invalidReference, bytes)).rejects.toBeInstanceOf(GenericBadRequestError);
    await expect(service.retrieve(invalidReference)).rejects.toBeInstanceOf(GenericBadRequestError);
    await expect(service.delete(invalidReference)).rejects.toBeInstanceOf(GenericBadRequestError);
  });

  test('rejects bytes inconsistent with their reference before writing', async () => {
    await expect(service.store(reference, Buffer.from('different'))).rejects.toBeInstanceOf(GenericDataLossError);
    await expect(access(join(rootPath, 'payloads', reference.id))).rejects.toBeDefined();
  });

  test('returns not found when a payload file is missing', async () => {
    await expect(service.retrieve(reference)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  test('detects corrupt payload bytes during retrieval', async () => {
    await mkdir(join(rootPath, 'payloads'), { recursive: true });
    await writeFile(join(rootPath, 'payloads', reference.id), Buffer.from('corrupt'));

    await expect(service.retrieve(reference)).rejects.toBeInstanceOf(GenericDataLossError);
  });

  test('deletes an existing payload and treats a repeated delete as successful', async () => {
    await service.store(reference, bytes);

    await expect(service.delete(reference)).resolves.toBeUndefined();
    await expect(service.delete(reference)).resolves.toBeUndefined();
    await expect(access(join(rootPath, 'payloads', reference.id))).rejects.toBeDefined();
  });

  test('rejects deletion when the payload path is a directory', async () => {
    const payloadPath = join(rootPath, 'payloads', reference.id);

    await mkdir(payloadPath, { recursive: true });

    await expect(service.delete(reference)).rejects.toBeInstanceOf(GenericInternalServerError);
    expect((await stat(payloadPath)).isDirectory()).toBe(true);
  });

  test('deletes only temporary files older than the cutoff', async () => {
    const temporaryPath = join(rootPath, 'tmp');
    const oldFilePath = join(temporaryPath, 'old-file');
    const recentFilePath = join(temporaryPath, 'recent-file');
    const directoryPath = join(temporaryPath, 'directory');
    const oldTime = new Date('2026-01-01T00:00:00.000Z');
    const recentTime = new Date('2026-01-03T00:00:00.000Z');

    await mkdir(directoryPath, { recursive: true });
    await writeFile(oldFilePath, bytes);
    await writeFile(recentFilePath, bytes);
    await utimes(oldFilePath, oldTime, oldTime);
    await utimes(recentFilePath, recentTime, recentTime);
    await utimes(directoryPath, oldTime, oldTime);

    await service.deleteTemporaryFiles(new Date('2026-01-02T00:00:00.000Z'));

    await expect(access(oldFilePath)).rejects.toBeDefined();
    await expect(access(recentFilePath)).resolves.toBeUndefined();
    expect((await stat(directoryPath)).isDirectory()).toBe(true);
  });

  test('treats a missing temporary directory as already clean', async () => {
    await expect(service.deleteTemporaryFiles(new Date())).resolves.toBeUndefined();
  });
});
