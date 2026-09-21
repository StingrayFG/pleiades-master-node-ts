import { Prisma, type Bucket as PrismaBucket, type PrismaClient } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericMapperError } from '@/errors/application.errors';

import type { CreateBucketRepositoryInput } from '../bucket.application';
import type { Bucket } from '../bucket.domain';
import { BucketRepository } from '../bucket.repository';

/* fixtures */

const userId = '00000000-0000-4000-8000-000000000001';
const bucketId = '00000000-0000-4000-8000-000000000002';
const bucketName = 'test-bucket';

const prismaBucket: PrismaBucket = {
  id: bucketId,
  name: bucketName,

  user_id: userId,

  state: 'active',

  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),

  revision: 0n
};

const domainBucket: Bucket = {
  id: prismaBucket.id,
  name: prismaBucket.name,

  userId: prismaBucket.user_id,

  state: prismaBucket.state,

  createdAt: prismaBucket.created_at,
  updatedAt: prismaBucket.updated_at,

  revision: prismaBucket.revision
};

const createInput: CreateBucketRepositoryInput = {
  id: bucketId,
  name: bucketName,

  userId,

  state: 'active',

  revision: 0n
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });
};

/* stub */

class PrismaBucketDelegateStub {
  findManyResult: PrismaBucket[] = [];
  findUniqueResult: PrismaBucket | null = null;
  createResult = prismaBucket;
  deleteResult = prismaBucket;

  findManyError: unknown;
  findUniqueError: unknown;
  createError: unknown;
  deleteError: unknown;

  findManyCalls: unknown[] = [];
  findUniqueCalls: unknown[] = [];
  createCalls: unknown[] = [];
  deleteCalls: unknown[] = [];

  async findMany(input: unknown): Promise<PrismaBucket[]> {
    this.findManyCalls.push(input);

    if (this.findManyError) {
      throw this.findManyError;
    }

    return this.findManyResult;
  }

  async findUnique(input: unknown): Promise<PrismaBucket | null> {
    this.findUniqueCalls.push(input);

    if (this.findUniqueError) {
      throw this.findUniqueError;
    }

    return this.findUniqueResult;
  }

  async create(input: unknown): Promise<PrismaBucket> {
    this.createCalls.push(input);

    if (this.createError) {
      throw this.createError;
    }

    return this.createResult;
  }

  async delete(input: unknown): Promise<PrismaBucket> {
    this.deleteCalls.push(input);

    if (this.deleteError) {
      throw this.deleteError;
    }

    return this.deleteResult;
  }
}

const createRepository = (): { repository: BucketRepository; delegate: PrismaBucketDelegateStub } => {
  const delegate = new PrismaBucketDelegateStub();
  const prisma = { bucket: delegate } as unknown as PrismaClient;

  return {
    repository: new BucketRepository(prisma),
    delegate
  };
};

/* tests */

describe('BucketRepository', () => {
  test('lists user buckets ordered by name', async () => {
    const { repository, delegate } = createRepository();

    delegate.findManyResult = [prismaBucket];

    const result = await repository.listAll(userId);

    expect(result).toEqual([domainBucket]);
    expect(delegate.findManyCalls).toEqual([
      {
        where: {
          user_id: userId
        },
        orderBy: {
          name: 'asc'
        }
      }
    ]);
  });

  test('propagates a mapper error when Prisma returns an invalid bucket', async () => {
    const { repository, delegate } = createRepository();

    delegate.findManyResult = [
      {
        ...prismaBucket,
        name: 'invalid/name'
      }
    ];

    await expect(repository.listAll(userId)).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('finds a bucket by its owner and name', async () => {
    const { repository, delegate } = createRepository();

    delegate.findUniqueResult = prismaBucket;

    const result = await repository.findByName(userId, bucketName);

    expect(result).toEqual(domainBucket);
    expect(delegate.findUniqueCalls).toEqual([
      {
        where: {
          user_id_name: {
            user_id: userId,
            name: bucketName
          }
        }
      }
    ]);
  });

  test('returns null when a bucket cannot be found by name', async () => {
    const { repository } = createRepository();

    await expect(repository.findByName(userId, bucketName)).resolves.toBeNull();
  });

  test('creates a bucket using explicit task data', async () => {
    const { repository, delegate } = createRepository();

    const result = await repository.create(createInput);

    expect(result).toEqual(domainBucket);
    expect(delegate.createCalls).toEqual([
      {
        data: {
          id: bucketId,
          name: bucketName,

          user_id: userId,

          state: 'active',

          revision: 0n
        }
      }
    ]);
  });

  test('maps create uniqueness violations to an already-exists error', async () => {
    const { repository, delegate } = createRepository();

    delegate.createError = createPrismaError('P2002');

    await expect(repository.create(createInput)).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
      message: 'Bucket already exists'
    } satisfies Partial<GenericAlreadyExistsError>);
  });

  test('deletes a bucket by id', async () => {
    const { repository, delegate } = createRepository();

    const result = await repository.deleteById(bucketId);

    expect(result).toEqual(domainBucket);
    expect(delegate.deleteCalls).toEqual([
      {
        where: {
          id: bucketId
        }
      }
    ]);
  });

  test('returns null when a repeated delete no longer finds the bucket', async () => {
    const { repository, delegate } = createRepository();

    delegate.deleteError = createPrismaError('P2025');

    await expect(repository.deleteById(bucketId)).resolves.toBeNull();
  });

  test('preserves an unmapped Prisma failure', async () => {
    const { repository, delegate } = createRepository();

    const repositoryError = new Error('Unexpected repository failure');

    delegate.findManyError = repositoryError;

    await expect(repository.listAll(userId)).rejects.toBe(repositoryError);
  });
});
