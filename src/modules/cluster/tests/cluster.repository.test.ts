import {
  Prisma,
  type Cluster as PrismaCluster,
  type MasterNode as PrismaMasterNode,
  type PrismaClient
} from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericConflictError, GenericMapperError } from '@/errors/application.errors';

import type { CreateClusterRepositoryInput } from '../cluster.application';
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
  id: 'master-node-a',
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
  updated_at: now,
  revision: 1n
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
  ]
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
};

type TransactionMock = {
  cluster: ClusterDelegateMock;
  masterNode: MasterNodeDelegateMock;
};

describe('ClusterRepository', () => {
  let delegate: ClusterDelegateMock;
  let masterNodeDelegate: MasterNodeDelegateMock;
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
      upsert: jest.fn<(...args: unknown[]) => Promise<PrismaMasterNode>>().mockResolvedValue(prismaMasterNode)
    };

    transaction = {
      cluster: delegate,
      masterNode: masterNodeDelegate
    };

    runTransaction = jest.fn(async (action) => action(transaction));

    repository = new ClusterRepository({
      cluster: delegate,
      masterNode: masterNodeDelegate,
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

  test('captures the singleton cluster and master membership in one transaction', async () => {
    await expect(repository.findMembershipSnapshot()).resolves.toEqual(snapshot);
    expect(masterNodeDelegate.findMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID
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

  test('installs master membership and advances the snapshot revision transactionally', async () => {
    await expect(repository.applyMembershipSnapshot(snapshot)).resolves.toBeUndefined();

    expect(masterNodeDelegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: prismaMasterNode.id
        }
      })
    );
    expect(delegate.update).toHaveBeenCalledWith({
      where: {
        id: CLUSTER_RECORD_ID
      },
      data: {
        membership_revision: snapshot.cluster.membershipRevision
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
    expect(delegate.update).not.toHaveBeenCalled();
  });

  test('rejects a membership snapshot that changes an existing master certificate', async () => {
    masterNodeDelegate.findMany.mockResolvedValue([
      {
        ...prismaMasterNode,
        certificate_fingerprint: 'cd'.repeat(32)
      }
    ]);

    await expect(repository.applyMembershipSnapshot(snapshot)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeDelegate.upsert).not.toHaveBeenCalled();
    expect(delegate.update).not.toHaveBeenCalled();
  });
});
