import type { Cluster as PrismaCluster } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import { mapPrismaClusterToDomainCluster } from '../cluster.mappers';

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

/* tests */

describe('cluster mappers', () => {
  test('maps a Prisma cluster to the domain model', () => {
    expect(mapPrismaClusterToDomainCluster(prismaCluster)).toEqual(cluster);
  });

  test('wraps invalid Prisma rows in mapper errors', () => {
    expect(() =>
      mapPrismaClusterToDomainCluster({
        ...prismaCluster,
        cluster_id: 'invalid-cluster-id'
      })
    ).toThrow(GenericMapperError);
  });
});
