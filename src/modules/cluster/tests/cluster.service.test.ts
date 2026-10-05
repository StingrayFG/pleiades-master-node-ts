import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError
} from '@/errors/application.errors';

import type { MembershipRevisionTransactionAction } from '../cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import type { ClusterRepositoryContract } from '../cluster.repository';
import { ClusterService } from '../cluster.service';
import type { ClusterMembershipSnapshot } from '../cluster.membership-snapshot';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000001',
  membershipRevision: 0n,
  createdAt: now,
  updatedAt: now
};

const snapshot: ClusterMembershipSnapshot = {
  cluster,
  masterNodes: [],
  dataNodes: []
};

/* mocks */

const createClusterRepositoryMock = (): jest.Mocked<ClusterRepositoryContract> => {
  return {
    find: jest.fn<ClusterRepositoryContract['find']>().mockResolvedValue(null),
    findMembershipSnapshot: jest.fn<ClusterRepositoryContract['findMembershipSnapshot']>().mockResolvedValue(null),
    create: jest.fn<ClusterRepositoryContract['create']>().mockResolvedValue(cluster),
    withAdvancedMembershipRevision: jest.fn<ClusterRepositoryContract['withAdvancedMembershipRevision']>(),
    applyMembershipSnapshot: jest.fn<ClusterRepositoryContract['applyMembershipSnapshot']>().mockResolvedValue()
  } as unknown as jest.Mocked<ClusterRepositoryContract>;
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

  test('captures the current master membership snapshot', async () => {
    repository.findMembershipSnapshot.mockResolvedValue(snapshot);

    await expect(service.captureMembershipSnapshot()).resolves.toBe(snapshot);
  });

  test('rejects membership snapshot capture before the cluster has been initialized', async () => {
    await expect(service.captureMembershipSnapshot()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
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

  test('reuses the registered cluster when its identity matches', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects registration when this node already belongs to another cluster', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.registerCluster('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(
      GenericConflictError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('registers an existing cluster identity locally', async () => {
    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
    expect(repository.create).toHaveBeenCalledWith({
      id: CLUSTER_RECORD_ID,
      clusterId: cluster.clusterId
    });
  });

  test('returns a matching cluster created by a concurrent registration', async () => {
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(cluster);
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Cluster already exists'));

    await expect(service.registerCluster(cluster.clusterId)).resolves.toBe(cluster);
    expect(repository.find).toHaveBeenCalledTimes(2);
  });

  test('rejects a different cluster created by a concurrent registration', async () => {
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...cluster,
      clusterId: '00000000-0000-4000-8000-000000000099'
    });
    repository.create.mockRejectedValue(new GenericAlreadyExistsError('Cluster already exists'));

    await expect(service.registerCluster(cluster.clusterId)).rejects.toBeInstanceOf(GenericConflictError);
  });

  test('preserves a duplicate registration error when the concurrent cluster cannot be read', async () => {
    const createError = new GenericAlreadyExistsError('Cluster already exists');

    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.create.mockRejectedValue(createError);

    await expect(service.registerCluster(cluster.clusterId)).rejects.toBe(createError);
  });

  test('propagates non-duplicate cluster registration errors without retrying the read', async () => {
    const createError = new GenericInternalServerError('Cluster storage unavailable');

    repository.create.mockRejectedValue(createError);

    await expect(service.registerCluster(cluster.clusterId)).rejects.toBe(createError);
    expect(repository.find).toHaveBeenCalledTimes(1);
  });

  test('advances the membership revision of an initialized cluster', async () => {
    repository.find.mockResolvedValue(cluster);
    repository.withAdvancedMembershipRevision.mockResolvedValue('applied');

    const action = jest.fn<MembershipRevisionTransactionAction<string>>().mockResolvedValue('applied');

    await expect(service.withAdvancedMembershipRevision(action)).resolves.toBe('applied');
    expect(repository.withAdvancedMembershipRevision).toHaveBeenCalledWith(action, undefined);
  });

  test('rejects membership revision advancement before initialization', async () => {
    const action = jest.fn<MembershipRevisionTransactionAction<void>>().mockResolvedValue();

    await expect(service.withAdvancedMembershipRevision(action)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(repository.withAdvancedMembershipRevision).not.toHaveBeenCalled();
  });

  test('applies a membership snapshot from the registered cluster', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(service.applyMembershipSnapshot(snapshot)).resolves.toBeUndefined();
    expect(repository.applyMembershipSnapshot).toHaveBeenCalledWith(snapshot);
  });

  test('rejects a membership snapshot from another cluster', async () => {
    repository.find.mockResolvedValue(cluster);

    await expect(
      service.applyMembershipSnapshot({
        ...snapshot,
        cluster: {
          ...cluster,
          clusterId: '00000000-0000-4000-8000-000000000099'
        }
      })
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.applyMembershipSnapshot).not.toHaveBeenCalled();
  });
});
