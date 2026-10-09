import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError
} from '@/errors/application.errors';

import type { Cluster, ClusterId } from './cluster.domain';
import type { MembershipRevisionTransactionAction } from './cluster.application';
import type { ClusterRepositoryContract } from './cluster.repository';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';
import { verifyMembershipSnapshotCluster } from './cluster.verifiers';

/* contract */

type ClusterServiceContract = {
  // cluster
  getCluster(): Promise<Cluster>;
  initializeCluster(): Promise<Cluster>;
  registerCluster(clusterId: ClusterId): Promise<Cluster>;

  // membership
  captureMembershipSnapshot(): Promise<ClusterMembershipSnapshot>;
  applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void>;
  withAdvancedMembershipRevision<TResult>(
    action: MembershipRevisionTransactionAction<TResult>,
    tx?: Prisma.TransactionClient
  ): Promise<TResult>;
};

/* service */

class ClusterService implements ClusterServiceContract {
  constructor(private readonly repository: ClusterRepositoryContract) {}

  /* cluster methods */

  async getCluster(): Promise<Cluster> {
    const cluster = await this.repository.find();

    if (!cluster) {
      throw new GenericFailedPreconditionError('The cluster has not been initialized');
    }

    return cluster;
  }

  async initializeCluster(): Promise<Cluster> {
    const existingCluster = await this.repository.find();

    if (existingCluster) {
      return existingCluster;
    }

    try {
      return await this.repository.create({
        clusterId: randomUUID()
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      const concurrentlyCreatedCluster = await this.repository.find();

      if (!concurrentlyCreatedCluster) {
        throw err;
      }

      return concurrentlyCreatedCluster;
    }
  }

  async registerCluster(clusterId: ClusterId): Promise<Cluster> {
    const existingCluster = await this.repository.find();

    if (existingCluster) {
      if (existingCluster.clusterId !== clusterId) {
        throw new GenericConflictError('This master node already belongs to a different cluster');
      }

      return existingCluster;
    }

    try {
      return await this.repository.create({
        clusterId
      });
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      const concurrentlyCreatedCluster = await this.repository.find();

      if (!concurrentlyCreatedCluster) {
        throw err;
      }

      if (concurrentlyCreatedCluster.clusterId !== clusterId) {
        throw new GenericConflictError('This master node already belongs to a different cluster');
      }

      return concurrentlyCreatedCluster;
    }
  }

  /* membership methods */

  async captureMembershipSnapshot(): Promise<ClusterMembershipSnapshot> {
    const snapshot = await this.repository.findMembershipSnapshot();

    if (!snapshot) {
      throw new GenericFailedPreconditionError('The cluster has not been initialized');
    }

    return snapshot;
  }

  async applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void> {
    const cluster = await this.getCluster();

    verifyMembershipSnapshotCluster(cluster, snapshot);

    await this.repository.applyMembershipSnapshot(snapshot);
  }

  // runs the action in the same transaction that advances the membership revision.
  async withAdvancedMembershipRevision<TResult>(
    action: MembershipRevisionTransactionAction<TResult>,
    tx?: Prisma.TransactionClient
  ): Promise<TResult> {
    await this.getCluster();

    return this.repository.withAdvancedMembershipRevision(action, tx);
  }
}

/* exports */

export { ClusterService };
export type { ClusterServiceContract };
