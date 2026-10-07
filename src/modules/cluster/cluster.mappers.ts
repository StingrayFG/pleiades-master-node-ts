import type {
  Cluster as PrismaCluster,
  DataNode as PrismaDataNode,
  MasterNode as PrismaMasterNode
} from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';
import { mapPrismaDataNodeToDomainDataNode } from '@/modules/data-nodes/data-node.mappers';
import { mapPrismaMasterNodeToDomainMasterNode } from '@/modules/master-nodes/master-node.mappers';

import { clusterSchema, type Cluster } from './cluster.domain';
import {
  clusterMembershipSnapshotSchema,
  type ClusterMembershipSnapshot
} from './cluster.membership-snapshot';

type PrismaClusterMembershipSnapshot = {
  cluster: PrismaCluster;
  masterNodes: PrismaMasterNode[];
  dataNodes: PrismaDataNode[];
};

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

export const mapPrismaClusterMembershipSnapshotToDomainClusterMembershipSnapshot = (
  snapshot: PrismaClusterMembershipSnapshot
): ClusterMembershipSnapshot => {
  return withMapperError('Failed to map Prisma cluster membership snapshot to domain', () => {
    return clusterMembershipSnapshotSchema.parse({
      cluster: mapPrismaClusterToDomainCluster(snapshot.cluster),
      masterNodes: snapshot.masterNodes.map(mapPrismaMasterNodeToDomainMasterNode),
      dataNodes: snapshot.dataNodes.map(mapPrismaDataNodeToDomainDataNode)
    });
  });
};
