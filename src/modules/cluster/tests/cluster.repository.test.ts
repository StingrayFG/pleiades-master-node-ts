import {
  Prisma,
  type Cluster as PrismaCluster,
  type DataNode as PrismaDataNode,
  type MasterNode as PrismaMasterNode,
  type PrismaClient
} from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericConflictError, GenericMapperError } from '@/errors/application.errors';

import type { CreateClusterRepositoryInput, MembershipRevisionTransactionAction } from '../cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import { ClusterRepository } from '../cluster.repository';
import type { ClusterMembershipSnapshot } from '../cluster.membership-snapshot';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaCluster: PrismaCluster = {
  id: CLUSTER_RECORD_ID,
  cluster_id: '00000000-0000-4000-8000-000000000001',
  membership_revision: 0n,
  created_at: now,
  updated_at: now
};

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: prismaCluster.cluster_id,
  membershipRevision: 0n,
  createdAt: now,
  updatedAt: now
};

const createInput: CreateClusterRepositoryInput = {
  id: CLUSTER_RECORD_ID,
  clusterId: cluster.clusterId
};

const prismaMasterNode: PrismaMasterNode = {
  id: 'master-node-aaaaaaaaaaaa',
  cluster_record_id: CLUSTER_RECORD_ID,
  certificate_fingerprint: 'ab'.repeat(32),
  session_id: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: 'master-node-a.internal',
  port: 4410,
  scheme: 'grpcs',
  registered_at: now,
  last_contact_at: now,
  last_health_check_at: null,
  last_heartbeat_at: null,
  removed_at: null,
  updated_at: now,
  revision: 1n
};

const prismaDataNode: PrismaDataNode = {
  id: 'data-node-a',
  cluster_record_id: CLUSTER_RECORD_ID,
  certificate_fingerprint: 'ef'.repeat(32),
  session_id: '00000000-0000-4000-8000-000000000002',
  last_heartbeat_sequence: 2n,
  state: 'active',
  mode: 'serving',
  hostname: 'data-node-a.internal',
  port: 4420,
  scheme: 'grpcs',
  storage_total_bytes: 1_000n,
  storage_free_bytes: 400n,
  registered_at: now,
  last_contact_at: now,
  last_health_check_at: null,
  last_heartbeat_at: now,
  removed_at: null,
  updated_at: now,
  revision: 2n
};

const snapshot: ClusterMembershipSnapshot = {
  cluster,
  masterNodes: [
    {
      id: prismaMasterNode.id,
      certificateFingerprint: prismaMasterNode.certificate_fingerprint,
      sessionId: prismaMasterNode.session_id,
      state: prismaMasterNode.state,
      mode: prismaMasterNode.mode,
      hostname: prismaMasterNode.hostname,
      port: prismaMasterNode.port,
      scheme: 'grpcs',
      registeredAt: prismaMasterNode.registered_at,
      lastContactAt: prismaMasterNode.last_contact_at,
      lastHealthCheckAt: prismaMasterNode.last_health_check_at,
      lastHeartbeatAt: prismaMasterNode.last_heartbeat_at,
      updatedAt: prismaMasterNode.updated_at,
      revision: prismaMasterNode.revision
    }
  ],
  dataNodes: [
    {
      id: prismaDataNode.id,
      certificateFingerprint: prismaDataNode.certificate_fingerprint,
      sessionId: prismaDataNode.session_id,
      lastHeartbeatSequence: prismaDataNode.last_heartbeat_sequence,
      state: prismaDataNode.state,
      mode: prismaDataNode.mode,
      hostname: prismaDataNode.hostname,
      port: prismaDataNode.port,
      scheme: 'grpcs',
      storageTotalBytes: prismaDataNode.storage_total_bytes,
      storageFreeBytes: prismaDataNode.storage_free_bytes,
      registeredAt: prismaDataNode.registered_at,
      lastContactAt: prismaDataNode.last_contact_at,
      lastHealthCheckAt: prismaDataNode.last_health_check_at,
      lastHeartbeatAt: prismaDataNode.last_heartbeat_at,
      updatedAt: prismaDataNode.updated_at,
      revision: prismaDataNode.revision
    }
  ]
};

const newerSnapshot: ClusterMembershipSnapshot = {
  ...snapshot,
  cluster: {
    ...cluster,
    membershipRevision: 1n
  }
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
  update: jest.Mock<(...args: unknown[]) => Promise<PrismaCluster>>;
};

type MasterNodeDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaMasterNode[]>>;
  upsert: jest.Mock<(...args: unknown[]) => Promise<PrismaMasterNode>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

type DataNodeDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaDataNode[]>>;
  upsert: jest.Mock<(...args: unknown[]) => Promise<PrismaDataNode>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

type TransactionMock = {
  cluster: ClusterDelegateMock;
  masterNode: MasterNodeDelegateMock;
  dataNode: DataNodeDelegateMock;
};

describe('ClusterRepository', () => {
  let delegate: ClusterDelegateMock;
  let masterNodeDelegate: MasterNodeDelegateMock;
  let dataNodeDelegate: DataNodeDelegateMock;
  let transaction: TransactionMock;
  let runTransaction: jest.Mock<(action: (transaction: TransactionMock) => Promise<unknown>) => Promise<unknown>>;
  let repository: ClusterRepository;

  beforeEach(() => {
    delegate = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<PrismaCluster | null>>().mockResolvedValue(prismaCluster),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaCluster>>().mockResolvedValue(prismaCluster),
      update: jest.fn<(...args: unknown[]) => Promise<PrismaCluster>>().mockResolvedValue(prismaCluster)
    };

    masterNodeDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaMasterNode[]>>().mockResolvedValue([prismaMasterNode]),
      upsert: jest.fn<(...args: unknown[]) => Promise<PrismaMasterNode>>().mockResolvedValue(prismaMasterNode),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 0 })
    };

    dataNodeDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaDataNode[]>>().mockResolvedValue([prismaDataNode]),
      upsert: jest.fn<(...args: unknown[]) => Promise<PrismaDataNode>>().mockResolvedValue(prismaDataNode),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 0 })
    };

    transaction = {
      cluster: delegate,
      masterNode: masterNodeDelegate,
      dataNode: dataNodeDelegate
    };

    runTransaction = jest.fn(async (action) => action(transaction));

    repository = new ClusterRepository({
      cluster: delegate,
      masterNode: masterNodeDelegate,
      dataNode: dataNodeDelegate,
      $transaction: runTransaction
    } as unknown as PrismaClient);
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

  test('returns null when a membership snapshot is captured before cluster initialization', async () => {
    delegate.findUnique.mockResolvedValue(null);

    await expect(repository.findMembershipSnapshot()).resolves.toBeNull();
    expect(masterNodeDelegate.findMany).not.toHaveBeenCalled();
  });

  test('captures the singleton cluster and master membership in one transaction', async () => {
    await expect(repository.findMembershipSnapshot()).resolves.toEqual(snapshot);
    expect(masterNodeDelegate.findMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null
      },
      orderBy: {
        id: 'asc'
      }
    });
    expect(dataNodeDelegate.findMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null
      },
      orderBy: {
        id: 'asc'
      }
    });
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

  test('advances the cluster membership revision and runs the action in the transaction', async () => {
    const action = jest.fn<MembershipRevisionTransactionAction<string>>().mockResolvedValue('applied');

    await expect(repository.withAdvancedMembershipRevision(action)).resolves.toBe('applied');
    expect(delegate.update).toHaveBeenCalledWith({
      where: {
        id: CLUSTER_RECORD_ID
      },
      data: {
        membership_revision: {
          increment: 1
        }
      }
    });
    expect(action).toHaveBeenCalledWith(transaction as unknown as Prisma.TransactionClient);
  });

  test('rejects membership application before the local cluster is registered', async () => {
    delegate.findUnique.mockResolvedValue(null);

    await expect(repository.applyMembershipSnapshot(newerSnapshot)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeDelegate.findMany).not.toHaveBeenCalled();
  });

  test('rejects membership from a different cluster', async () => {
    await expect(
      repository.applyMembershipSnapshot({
        ...newerSnapshot,
        cluster: {
          ...newerSnapshot.cluster,
          clusterId: '00000000-0000-4000-8000-000000000099'
        }
      })
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeDelegate.findMany).not.toHaveBeenCalled();
  });

  test('installs master membership and advances the snapshot revision transactionally', async () => {
    await expect(repository.applyMembershipSnapshot(newerSnapshot)).resolves.toBeUndefined();

    expect(masterNodeDelegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: prismaMasterNode.id
        },
        update: expect.objectContaining({
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,
          registered_at: prismaMasterNode.registered_at
        })
      })
    );
    expect(dataNodeDelegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: prismaDataNode.id
        },
        update: expect.objectContaining({
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,
          registered_at: prismaDataNode.registered_at
        })
      })
    );
    expect(delegate.update).toHaveBeenCalledWith({
      where: {
        id: CLUSTER_RECORD_ID
      },
      data: {
        membership_revision: newerSnapshot.cluster.membershipRevision
      }
    });
  });

  test('accepts an exact replay at the current membership revision without writing', async () => {
    await expect(repository.applyMembershipSnapshot(snapshot)).resolves.toBeUndefined();

    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(masterNodeDelegate.updateMany).not.toHaveBeenCalled();
    expect(dataNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(dataNodeDelegate.updateMany).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('rejects different membership at the current membership revision', async () => {
    await expect(
      repository.applyMembershipSnapshot({
        ...snapshot,
        masterNodes: [
          {
            ...snapshot.masterNodes[0],
            mode: 'draining'
          }
        ]
      })
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(masterNodeDelegate.updateMany).not.toHaveBeenCalled();
    expect(dataNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(dataNodeDelegate.updateMany).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('rejects different data node inventory at the current membership revision', async () => {
    await expect(
      repository.applyMembershipSnapshot({
        ...snapshot,
        dataNodes: [
          {
            ...snapshot.dataNodes[0],
            storageFreeBytes: 300n
          }
        ]
      })
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(dataNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('marks master nodes omitted from a newer membership snapshot as removed', async () => {
    masterNodeDelegate.findMany.mockResolvedValueOnce([prismaMasterNode]);

    await expect(repository.applyMembershipSnapshot(newerSnapshot)).resolves.toBeUndefined();

    expect(masterNodeDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null,
        id: {
          notIn: [prismaMasterNode.id]
        }
      },
      data: {
        removed_at: expect.any(Date)
      }
    });
  });

  test('marks data nodes omitted from a newer membership snapshot as removed', async () => {
    dataNodeDelegate.findMany.mockResolvedValueOnce([prismaDataNode]);

    await expect(repository.applyMembershipSnapshot(newerSnapshot)).resolves.toBeUndefined();

    expect(dataNodeDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null,
        id: {
          notIn: [prismaDataNode.id]
        }
      },
      data: {
        removed_at: expect.any(Date)
      }
    });
  });

  test('ignores a membership snapshot older than the local membership revision', async () => {
    delegate.findUnique.mockResolvedValue({
      ...prismaCluster,
      membership_revision: 2n
    });

    await expect(repository.applyMembershipSnapshot(snapshot)).resolves.toBeUndefined();
    expect(masterNodeDelegate.findMany).not.toHaveBeenCalled();
    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(dataNodeDelegate.findMany).not.toHaveBeenCalled();
    expect(dataNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('rejects a membership snapshot that changes an existing master certificate', async () => {
    masterNodeDelegate.findMany.mockResolvedValue([
      {
        ...prismaMasterNode,
        certificate_fingerprint: 'cd'.repeat(32)
      }
    ]);

    await expect(repository.applyMembershipSnapshot(newerSnapshot)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('rejects a membership snapshot that changes an existing data node certificate', async () => {
    dataNodeDelegate.findMany.mockResolvedValue([
      {
        ...prismaDataNode,
        certificate_fingerprint: '12'.repeat(32)
      }
    ]);

    await expect(repository.applyMembershipSnapshot(newerSnapshot)).rejects.toBeInstanceOf(GenericConflictError);
    expect(dataNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });
});
