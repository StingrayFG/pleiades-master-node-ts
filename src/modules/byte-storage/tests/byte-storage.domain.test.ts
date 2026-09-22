import { Buffer } from 'node:buffer';

import type { ByteStorageObject as PrismaByteStorageObject } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericConflictError, GenericMapperError } from '@/errors/application.errors';

import {
  BYTE_STORAGE_CHECKSUM_ALGORITHM,
  byteStorageIdSchema,
  byteStorageObjectSchema,
  byteStorageReferenceSchema,
  type ByteStorageObject,
  type ByteStorageReference
} from '../byte-storage.domain';
import {
  mapByteStorageObjectToByteStorageReference,
  mapPrismaByteStorageObjectToDomainByteStorageObject
} from '../byte-storage.mappers';
import { calculateByteStorageChecksum } from '../byte-storage.processors';
import { verifyExistingByteStorageObject } from '../byte-storage.verifiers';

/* fixtures */

const bytes = Buffer.from('stored bytes');
const now = new Date('2026-01-01T00:00:00.000Z');

const reference: ByteStorageReference = {
  id: 'blob-test_1',
  sizeBytes: BigInt(bytes.length),
  checksum: calculateByteStorageChecksum(bytes),
  checksumAlgorithm: BYTE_STORAGE_CHECKSUM_ALGORITHM
};

const object: ByteStorageObject = {
  ...reference,
  state: 'active',
  createdAt: now,
  updatedAt: now
};

const prismaObject: PrismaByteStorageObject = {
  id: reference.id,
  size_bytes: reference.sizeBytes,
  checksum: reference.checksum,
  checksum_algorithm: reference.checksumAlgorithm,
  state: 'active',
  created_at: now,
  updated_at: now
};

/* tests */

describe('byte storage domain', () => {
  test('accepts valid references and objects', () => {
    expect(byteStorageReferenceSchema.parse(reference)).toEqual(reference);
    expect(byteStorageObjectSchema.parse(object)).toEqual(object);
  });

  test.each(['', '../payload', 'blob/test', 'blob.test', 'blob test', 'bløb'])('rejects unsafe storage id %j', (id) => {
    expect(byteStorageIdSchema.safeParse(id).success).toBe(false);
  });

  test('rejects invalid size, checksum, algorithm, and state values', () => {
    expect(byteStorageReferenceSchema.safeParse({ ...reference, sizeBytes: -1n }).success).toBe(false);
    expect(byteStorageReferenceSchema.safeParse({ ...reference, checksum: 'invalid' }).success).toBe(false);
    expect(byteStorageReferenceSchema.safeParse({ ...reference, checksumAlgorithm: 'md5' }).success).toBe(false);
    expect(byteStorageObjectSchema.safeParse({ ...object, state: 'deleted' }).success).toBe(false);
  });

  test('calculates a SHA-256 checksum', () => {
    expect(calculateByteStorageChecksum(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('maps storage objects to references', () => {
    expect(mapByteStorageObjectToByteStorageReference(object)).toEqual(reference);
  });

  test('maps Prisma storage objects to domain objects', () => {
    expect(mapPrismaByteStorageObjectToDomainByteStorageObject(prismaObject)).toEqual(object);
  });

  test('wraps invalid Prisma objects in mapper errors', () => {
    expect(() =>
      mapPrismaByteStorageObjectToDomainByteStorageObject({
        ...prismaObject,
        id: '../invalid'
      })
    ).toThrow(GenericMapperError);
  });

  test('accepts an existing object with the expected byte identity', () => {
    expect(() => verifyExistingByteStorageObject(object, reference)).not.toThrow();
  });

  test.each([
    ['id', { id: 'other-id' }],
    ['size', { sizeBytes: reference.sizeBytes + 1n }],
    ['checksum', { checksum: 'f'.repeat(64) }]
  ])('rejects an existing object with a different %s', (_field, override) => {
    expect(() =>
      verifyExistingByteStorageObject(object, {
        ...reference,
        ...override
      })
    ).toThrow(GenericConflictError);
  });
});
