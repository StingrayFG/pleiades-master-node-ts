import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError
} from '@/errors/application.errors';

import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import type { ClusterRepositoryContract } from '../cluster.repository';
import { ClusterService } from '../cluster.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000001',
  createdAt: now,
  updatedAt: now
};

/* mocks */

const createClusterRepositoryMock = (): jest.Mocked<ClusterRepositoryContract> => {
  return {
    find: jest.fn<ClusterRepositoryContract['find']>().mockResolvedValue(null),
    create: jest.fn<ClusterRepositoryContract['create']>().mockResolvedValue(cluster)
  };
};

/* tests */

describe('ClusterService', () => {
  let repository: jest.Mocked<ClusterRepositoryContract>;
  let service: ClusterService;

  beforeEach(() => {
    repository = createClusterRepositoryMock();
    service = new ClusterService(repository);
  });

  test('returns the initialized cluster', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.getCluster()).resolves.toBe(cluster);
  });

  test('rejects reads before the cluster has been initialized', async () => {
    await expect(service.getCluster()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
  });

  test('reuses the existing cluster during initialization', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.initializeCluster()).resolves.toBe(cluster);
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('generates and persists a UUID cluster identity', async () => {
    await expect(service.initializeCluster()).resolves.toBe(cluster);

    expect(repository.create).toHaveBeenCalledWith({
      id: CLUSTER_RECORD_ID,
      clusterId: expect.any(String)
    });

    const input = repository.create.mock.calls[0][0];

    expect(z.uuid().safeParse(input.clusterId).success).toBe(true);
  });

  test('returns the cluster created by a concurrent initializer', async () => {
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(cluster);
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Cluster already exists'));

    await expect(service.initializeCluster()).resolves.toBe(cluster);
    expect(repository.find).toHaveBeenCalledTimes(2);
  });

  test('preserves a duplicate error when the concurrent cluster cannot be read', async () => {
    const createError = new GenericAlreadyExistsError('Cluster already exists');

    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.create.mockRejectedValue(createError);

    await expect(service.initializeCluster()).rejects.toBe(createError);
  });

  test('propagates non-duplicate creation errors without retrying the read', async () => {
    const createError = new GenericInternalServerError('Cluster storage unavailable');

    repository.create.mockRejectedValue(createError);

    await expect(service.initializeCluster()).rejects.toBe(createError);
    expect(repository.find).toHaveBeenCalledTimes(1);
  });

  test('registers a leader-provided cluster identity', async () => {
    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
    expect(repository.create).toHaveBeenCalledWith({
      id: CLUSTER_RECORD_ID,
      clusterId: cluster.clusterId
    });
  });

  test('reuses an existing matching cluster registration', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects a different leader-provided cluster identity', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.registerCluster('00000000-0000-4000-8000-000000000002')).rejects.toBeInstanceOf(
      GenericConflictError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('returns a matching cluster created by a concurrent follower bootstrap', async () => {
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(cluster);
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Cluster already exists'));

    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
  });

  test('rejects a different cluster created during follower bootstrap', async () => {
    const otherCluster = {
      ...cluster,
      clusterId: '00000000-0000-4000-8000-000000000002'
    };

    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(otherCluster);
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Cluster already exists'));

    await expect(service.registerCluster(cluster.clusterId)).rejects.toBeInstanceOf(GenericConflictError);
  });
});
