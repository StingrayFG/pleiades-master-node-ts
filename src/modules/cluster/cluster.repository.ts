import { isDeepStrictEqual } from 'node:util';

import { Prisma, type PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAlreadyExistsError, GenericConflictError } from '@/errors/application.errors';
import { mapPrismaDataNodeToDomainDataNode } from '@/modules/data-nodes/data-node.mappers';
import { mapPrismaMasterNodeToDomainMasterNode } from '@/modules/master-nodes/master-node.mappers';

import type { CreateClusterRepositoryInput } from './cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from './cluster.domain';
import { mapPrismaClusterToDomainCluster } from './cluster.mappers';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';

/* contract */

type ClusterRepositoryContract = {
  // find
  find(): Promise<Cluster | null>;
  findMembershipSnapshot(): Promise<ClusterMembershipSnapshot | null>;

  // create
  create(input: CreateClusterRepositoryInput): Promise<Cluster>;

  // membership
  advanceMembershipRevision(): Promise<Cluster>;
  applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {
  errors: {
    uniqueConstraintViolation: {
      createError: (message, cause) => new GenericAlreadyExistsError(message, { cause }),
      message: 'Cluster already exists'
    }
  }
};

class ClusterRepository implements ClusterRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  /* find methods */

  async find(): Promise<Cluster | null> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.findUnique({
        where: {
          id: CLUSTER_RECORD_ID
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return cluster ? mapPrismaClusterToDomainCluster(cluster) : null;
  }

  async findMembershipSnapshot(): Promise<ClusterMembershipSnapshot | null> {
    let snapshot;

    try {
      snapshot = await this.prisma.$transaction(
        async (transaction) => {
          const cluster = await transaction.cluster.findUnique({
            where: {
              id: CLUSTER_RECORD_ID
            }
          });

          if (!cluster) {
            return null;
          }

          const masterNodes = await transaction.masterNode.findMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null
            },
            orderBy: {
              id: 'asc'
            }
          });

          const dataNodes = await transaction.dataNode.findMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null
            },
            orderBy: {
              id: 'asc'
            }
          });

          return {
            cluster,
            masterNodes,
            dataNodes
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
        }
      );
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!snapshot) {
      return null;
    }

    return {
      cluster: mapPrismaClusterToDomainCluster(snapshot.cluster),
      masterNodes: snapshot.masterNodes.map(mapPrismaMasterNodeToDomainMasterNode),
      dataNodes: snapshot.dataNodes.map(mapPrismaDataNodeToDomainDataNode)
    };
  }

  /* create methods */

  async create(input: CreateClusterRepositoryInput): Promise<Cluster> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.create({
        data: {
          id: input.id,
          cluster_id: input.clusterId
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaClusterToDomainCluster(cluster);
  }

  /* membership methods */

  async advanceMembershipRevision(): Promise<Cluster> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.update({
        where: {
          id: CLUSTER_RECORD_ID
        },
        data: {
          membership_revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaClusterToDomainCluster(cluster);
  }

  async applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const cluster = await transaction.cluster.findUnique({
            where: {
              id: CLUSTER_RECORD_ID
            }
          });

          if (!cluster) {
            throw new GenericConflictError('The local cluster has not been registered');
          }

          if (cluster.cluster_id !== snapshot.cluster.clusterId) {
            throw new GenericConflictError('Cluster membership snapshot belongs to a different cluster');
          }

          if (cluster.membership_revision > snapshot.cluster.membershipRevision) {
            return;
          }

          const currentMasterNodes = await transaction.masterNode.findMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null
            },
            orderBy: {
              id: 'asc'
            }
          });

          const currentDataNodes = await transaction.dataNode.findMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null
            },
            orderBy: {
              id: 'asc'
            }
          });

          if (cluster.membership_revision === snapshot.cluster.membershipRevision) {
            const currentMasterMembership = currentMasterNodes.map(mapPrismaMasterNodeToDomainMasterNode);
            const snapshotMasterMembership = [...snapshot.masterNodes].sort((left, right) =>
              left.id.localeCompare(right.id)
            );
            const currentDataNodeInventory = currentDataNodes.map(mapPrismaDataNodeToDomainDataNode);
            const snapshotDataNodeInventory = [...snapshot.dataNodes].sort((left, right) =>
              left.id.localeCompare(right.id)
            );

            if (
              !isDeepStrictEqual(currentMasterMembership, snapshotMasterMembership) ||
              !isDeepStrictEqual(currentDataNodeInventory, snapshotDataNodeInventory)
            ) {
              throw new GenericConflictError(
                'Cluster membership snapshot conflicts with the local cluster inventory at the same revision'
              );
            }

            return;
          }

          const snapshotMasterNodeIds = snapshot.masterNodes.map((masterNode) => masterNode.id);
          const snapshotDataNodeIds = snapshot.dataNodes.map((dataNode) => dataNode.id);

          const existingMasterNodes = await transaction.masterNode.findMany({
            where: {
              id: {
                in: snapshotMasterNodeIds
              }
            }
          });

          const existingDataNodes = await transaction.dataNode.findMany({
            where: {
              id: {
                in: snapshotDataNodeIds
              }
            }
          });

          for (const existingMasterNode of existingMasterNodes) {
            const snapshotMasterNode = snapshot.masterNodes.find(
              (masterNode) => masterNode.id === existingMasterNode.id
            );

            if (snapshotMasterNode?.certificateFingerprint !== existingMasterNode.certificate_fingerprint) {
              throw new GenericConflictError('Cluster membership snapshot changes an existing master node certificate');
            }
          }

          for (const existingDataNode of existingDataNodes) {
            const snapshotDataNode = snapshot.dataNodes.find((dataNode) => dataNode.id === existingDataNode.id);

            if (snapshotDataNode?.certificateFingerprint !== existingDataNode.certificate_fingerprint) {
              throw new GenericConflictError('Cluster membership snapshot changes an existing data node certificate');
            }
          }

          for (const masterNode of snapshot.masterNodes) {
            await transaction.masterNode.upsert({
              where: {
                id: masterNode.id
              },
              create: {
                id: masterNode.id,
                cluster_record_id: CLUSTER_RECORD_ID,

                certificate_fingerprint: masterNode.certificateFingerprint,
                session_id: masterNode.sessionId,
                state: masterNode.state,
                mode: masterNode.mode,

                hostname: masterNode.hostname,
                port: masterNode.port,
                scheme: masterNode.scheme,

                registered_at: masterNode.registeredAt,
                last_contact_at: masterNode.lastContactAt,
                last_health_check_at: masterNode.lastHealthCheckAt,
                last_heartbeat_at: masterNode.lastHeartbeatAt,
                removed_at: null,
                updated_at: masterNode.updatedAt,

                revision: masterNode.revision
              },
              update: {
                cluster_record_id: CLUSTER_RECORD_ID,

                session_id: masterNode.sessionId,
                state: masterNode.state,
                mode: masterNode.mode,

                hostname: masterNode.hostname,
                port: masterNode.port,
                scheme: masterNode.scheme,

                registered_at: masterNode.registeredAt,
                last_contact_at: masterNode.lastContactAt,
                last_health_check_at: masterNode.lastHealthCheckAt,
                last_heartbeat_at: masterNode.lastHeartbeatAt,
                removed_at: null,
                updated_at: masterNode.updatedAt,

                revision: masterNode.revision
              }
            });
          }

          for (const dataNode of snapshot.dataNodes) {
            await transaction.dataNode.upsert({
              where: {
                id: dataNode.id
              },
              create: {
                id: dataNode.id,
                cluster_record_id: CLUSTER_RECORD_ID,

                certificate_fingerprint: dataNode.certificateFingerprint,
                session_id: dataNode.sessionId,
                last_heartbeat_sequence: dataNode.lastHeartbeatSequence,
                state: dataNode.state,
                mode: dataNode.mode,

                hostname: dataNode.hostname,
                port: dataNode.port,
                scheme: dataNode.scheme,

                storage_total_bytes: dataNode.storageTotalBytes,
                storage_free_bytes: dataNode.storageFreeBytes,

                registered_at: dataNode.registeredAt,
                last_contact_at: dataNode.lastContactAt,
                last_health_check_at: dataNode.lastHealthCheckAt,
                last_heartbeat_at: dataNode.lastHeartbeatAt,
                removed_at: null,
                updated_at: dataNode.updatedAt,

                revision: dataNode.revision
              },
              update: {
                cluster_record_id: CLUSTER_RECORD_ID,

                session_id: dataNode.sessionId,
                last_heartbeat_sequence: dataNode.lastHeartbeatSequence,
                state: dataNode.state,
                mode: dataNode.mode,

                hostname: dataNode.hostname,
                port: dataNode.port,
                scheme: dataNode.scheme,

                storage_total_bytes: dataNode.storageTotalBytes,
                storage_free_bytes: dataNode.storageFreeBytes,

                registered_at: dataNode.registeredAt,
                last_contact_at: dataNode.lastContactAt,
                last_health_check_at: dataNode.lastHealthCheckAt,
                last_heartbeat_at: dataNode.lastHeartbeatAt,
                removed_at: null,
                updated_at: dataNode.updatedAt,

                revision: dataNode.revision
              }
            });
          }

          const removedAt = new Date();

          await transaction.masterNode.updateMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null,
              id: {
                notIn: snapshotMasterNodeIds
              }
            },
            data: {
              removed_at: removedAt
            }
          });

          await transaction.dataNode.updateMany({
            where: {
              cluster_record_id: CLUSTER_RECORD_ID,
              removed_at: null,
              id: {
                notIn: snapshotDataNodeIds
              }
            },
            data: {
              removed_at: removedAt
            }
          });

          await transaction.cluster.update({
            where: {
              id: CLUSTER_RECORD_ID
            },
            data: {
              membership_revision: snapshot.cluster.membershipRevision
            }
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
        }
      );
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }
  }
}

/* exports */

export { ClusterRepository };
export type { ClusterRepositoryContract };
