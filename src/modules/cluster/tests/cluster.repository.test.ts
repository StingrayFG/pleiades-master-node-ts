import { Prisma, type Cluster as PrismaCluster, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericMapperError } from '@/errors/application.errors';

import type { CreateClusterRepositoryInput } from '../cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import { ClusterRepository } from '../cluster.repository';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaCluster: PrismaCluster = {
  id: CLUSTER_RECORD_ID,
  cluster_id: '00000000-0000-4000-8000-000000000001',
  created_at: now,
  updated_at: now
};

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: prismaCluster.cluster_id,
  createdAt: now,
  updatedAt: now
};

const createInput: CreateClusterRepositoryInput = {
  id: CLUSTER_RECORD_ID,
  clusterId: cluster.clusterId
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });
};

/* mocks */

type ClusterDelegateMock = {
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaCluster | null>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaCluster>>;
};

describe('ClusterRepository', () => {
  let delegate: ClusterDelegateMock;
  let repository: ClusterRepository;

  beforeEach(() => {
    delegate = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<PrismaCluster | null>>().mockResolvedValue(prismaCluster),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaCluster>>().mockResolvedValue(prismaCluster)
    };

    repository = new ClusterRepository({ cluster: delegate } as unknown as PrismaClient);
  });

  test('finds the singleton cluster row', async () => {
    await expect(repository.find()).resolves.toEqual(cluster);
    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: { id: CLUSTER_RECORD_ID }
    });
  });

  test('returns null when the singleton cluster row does not exist', async () => {
    delegate.findUnique.mockResolvedValue(null);

    await expect(repository.find()).resolves.toBeNull();
  });

  test('creates the singleton cluster row', async () => {
    await expect(repository.create(createInput)).resolves.toEqual(cluster);
    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        id: CLUSTER_RECORD_ID,
        cluster_id: cluster.clusterId
      }
    });
  });

  test('maps concurrent cluster creation to an already-exists error', async () => {
    delegate.create.mockRejectedValue(createPrismaError('P2002'));

    await expect(repository.create(createInput)).rejects.toBeInstanceOf(GenericAlreadyExistsError);
  });

  test('propagates mapper validation failures from stored rows', async () => {
    delegate.findUnique.mockResolvedValue({
      ...prismaCluster,
      cluster_id: 'invalid-cluster-id'
    });

    await expect(repository.find()).rejects.toBeInstanceOf(GenericMapperError);
  });
});
