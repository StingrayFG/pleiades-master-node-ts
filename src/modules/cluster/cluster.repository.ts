import { Prisma, type PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error.mapper';
import { GenericAlreadyExistsError } from '@/errors/application.errors';
import type { DataNode, DataNodeId } from '@/modules/data-nodes/data-node.domain';
import { mapPrismaDataNodeToDomainDataNode } from '@/modules/data-nodes/data-node.mappers';
import type { MasterNode, MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import { mapPrismaMasterNodeToDomainMasterNode } from '@/modules/master-nodes/master-node.mappers';

import type { CreateClusterRepositoryInput, MembershipRevisionTransactionAction } from './cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from './cluster.domain';
import {
  mapPrismaClusterMembershipSnapshotToDomainClusterMembershipSnapshot,
  mapPrismaClusterToDomainCluster
} from './cluster.mappers';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';
import { resolveMembershipSnapshotAction } from './cluster.policies';
import {
  verifyClusterRegistered,
  verifyMembershipSnapshotCluster,
  verifyMembershipSnapshotConsistent,
  verifyMembershipSnapshotPreservesCertificates
} from './cluster.verifiers';

/* contract */

type ClusterRepositoryContract = {
  // cluster
  find(): Promise<Cluster | null>;
  create(input: CreateClusterRepositoryInput): Promise<Cluster>;

  // membership
  findMembershipSnapshot(): Promise<ClusterMembershipSnapshot | null>;
  applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void>;
  withAdvancedMembershipRevision<TResult>(
    action: MembershipRevisionTransactionAction<TResult>,
    tx?: Prisma.TransactionClient
  ): Promise<TResult>;
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

  /* public methods */

  /* cluster methods */

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

  async create(input: CreateClusterRepositoryInput): Promise<Cluster> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.create({
        data: {
          id: CLUSTER_RECORD_ID,
          cluster_id: input.clusterId
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaClusterToDomainCluster(cluster);
  }

  /* membership methods */

  // captures local membership as a cluster snapshot.
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

          const masterNodes = await this.listCurrentMasterNodes(transaction);
          const dataNodes = await this.listCurrentDataNodes(transaction);

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

    return mapPrismaClusterMembershipSnapshotToDomainClusterMembershipSnapshot(snapshot);
  }

  // synchronizes local membership with a cluster snapshot.
  // older revisions are ignored, matching revisions are verified, and newer revisions are applied.
  async applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const cluster = await this.requireSnapshotCluster(transaction, snapshot);

          const action = resolveMembershipSnapshotAction(
            cluster.membershipRevision,
            snapshot.cluster.membershipRevision
          );

          if (action === 'ignore') {
            return;
          }

          if (action === 'reconcile') {
            await this.verifySnapshotConsistency(transaction, snapshot);
            return;
          }

          await this.applyNewerSnapshot(transaction, snapshot);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
        }
      );
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }
  }

  async withAdvancedMembershipRevision<TResult>(
    action: MembershipRevisionTransactionAction<TResult>,
    tx?: Prisma.TransactionClient
  ): Promise<TResult> {
    let result;

    try {
      if (tx) {
        // joins an existing transaction instead of opening a new one
        await tx.cluster.update({
          where: {
            id: CLUSTER_RECORD_ID
          },
          data: {
            membership_revision: {
              increment: 1
            }
          }
        });

        return action(tx);
      }

      result = await this.prisma.$transaction(async (transaction) => {
        await transaction.cluster.update({
          where: {
            id: CLUSTER_RECORD_ID
          },
          data: {
            membership_revision: {
              increment: 1
            }
          }
        });

        return action(transaction);
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return result;
  }

  /* private methods */

  // reads and verifies the local cluster within the transaction that evaluates
  // and applies the snapshot.
  private async requireSnapshotCluster(
    transaction: Prisma.TransactionClient,
    snapshot: ClusterMembershipSnapshot
  ): Promise<Cluster> {
    const cluster = await transaction.cluster.findUnique({
      where: {
        id: CLUSTER_RECORD_ID
      }
    });

    const domainCluster = cluster ? mapPrismaClusterToDomainCluster(cluster) : null;

    verifyClusterRegistered(domainCluster);
    verifyMembershipSnapshotCluster(domainCluster, snapshot);

    return domainCluster;
  }

  private async verifySnapshotConsistency(
    transaction: Prisma.TransactionClient,
    snapshot: ClusterMembershipSnapshot
  ): Promise<void> {
    const currentMasterNodes = await this.listCurrentMasterNodes(transaction);
    const currentDataNodes = await this.listCurrentDataNodes(transaction);

    verifyMembershipSnapshotConsistent(
      currentMasterNodes.map(mapPrismaMasterNodeToDomainMasterNode),
      currentDataNodes.map(mapPrismaDataNodeToDomainDataNode),
      snapshot
    );
  }

  private async applyNewerSnapshot(
    transaction: Prisma.TransactionClient,
    snapshot: ClusterMembershipSnapshot
  ): Promise<void> {
    const snapshotMasterNodeIds = snapshot.masterNodes.map((masterNode) => masterNode.id);
    const snapshotDataNodeIds = snapshot.dataNodes.map((dataNode) => dataNode.id);

    await this.verifySnapshotPreservesCertificates(transaction, snapshot);
    await this.upsertSnapshotMasterNodes(transaction, snapshot.masterNodes);
    await this.upsertSnapshotDataNodes(transaction, snapshot.dataNodes);
    await this.detachAbsentSnapshotMasterNodes(transaction, snapshotMasterNodeIds);
    await this.detachAbsentSnapshotDataNodes(transaction, snapshotDataNodeIds);

    await transaction.cluster.update({
      where: {
        id: CLUSTER_RECORD_ID
      },
      data: {
        membership_revision: snapshot.cluster.membershipRevision
      }
    });
  }

  private async verifySnapshotPreservesCertificates(
    transaction: Prisma.TransactionClient,
    snapshot: ClusterMembershipSnapshot
  ): Promise<void> {
    const existingMasterNodes = await transaction.masterNode.findMany({
      where: {
        id: {
          in: snapshot.masterNodes.map((masterNode) => masterNode.id)
        }
      }
    });

    const existingDataNodes = await transaction.dataNode.findMany({
      where: {
        id: {
          in: snapshot.dataNodes.map((dataNode) => dataNode.id)
        }
      }
    });

    verifyMembershipSnapshotPreservesCertificates(
      existingMasterNodes.map(mapPrismaMasterNodeToDomainMasterNode),
      existingDataNodes.map(mapPrismaDataNodeToDomainDataNode),
      snapshot
    );
  }

  private async upsertSnapshotMasterNodes(
    transaction: Prisma.TransactionClient,
    masterNodes: MasterNode[]
  ): Promise<void> {
    for (const masterNode of masterNodes) {
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
          last_heartbeat_at: masterNode.lastHeartbeatAt,
          removed_at: null,
          updated_at: masterNode.updatedAt,

          revision: masterNode.revision
        }
      });
    }
  }

  private async upsertSnapshotDataNodes(transaction: Prisma.TransactionClient, dataNodes: DataNode[]): Promise<void> {
    for (const dataNode of dataNodes) {
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
  }

  private async detachAbsentSnapshotMasterNodes(
    transaction: Prisma.TransactionClient,
    snapshotMasterNodeIds: MasterNodeId[]
  ): Promise<void> {
    await transaction.masterNode.updateMany({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null,
        id: {
          notIn: snapshotMasterNodeIds
        }
      },
      data: {
        removed_at: new Date()
      }
    });
  }

  private async detachAbsentSnapshotDataNodes(
    transaction: Prisma.TransactionClient,
    snapshotDataNodeIds: DataNodeId[]
  ): Promise<void> {
    await transaction.dataNode.updateMany({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null,
        id: {
          notIn: snapshotDataNodeIds
        }
      },
      data: {
        removed_at: new Date()
      }
    });
  }

  private listCurrentMasterNodes(transaction: Prisma.TransactionClient) {
    return transaction.masterNode.findMany({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null
      },
      orderBy: {
        id: 'asc'
      }
    });
  }

  private listCurrentDataNodes(transaction: Prisma.TransactionClient) {
    return transaction.dataNode.findMany({
      where: {
        cluster_record_id: CLUSTER_RECORD_ID,
        removed_at: null
      },
      orderBy: {
        id: 'asc'
      }
    });
  }
}

/* exports */

export { ClusterRepository };
export type { ClusterRepositoryContract };
