import type { Cluster as PrismaCluster } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { clusterSchema, type Cluster } from './cluster.domain';

/* prisma -> domain */

export const mapPrismaClusterToDomainCluster = (cluster: PrismaCluster): Cluster => {
  return withMapperError('Failed to map Prisma cluster to domain cluster', () => {
    return clusterSchema.parse({
      id: cluster.id,
      clusterId: cluster.cluster_id,
      membershipRevision: cluster.membership_revision,

      createdAt: cluster.created_at,
      updatedAt: cluster.updated_at
    });
  });
};
