import { randomUUID } from 'node:crypto';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError
} from '@/errors/application.errors';

import { CLUSTER_RECORD_ID, clusterIdSchema, type Cluster, type ClusterId } from './cluster.domain';
import type { ClusterRepositoryContract } from './cluster.repository';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';
import { verifyMembershipSnapshotCluster } from './cluster.verifiers';

/* contract */

type ClusterServiceContract = {
  // query
  getCluster(): Promise<Cluster>;
  captureMembershipSnapshot(): Promise<ClusterMembershipSnapshot>;

  // initialization
  initializeCluster(): Promise<Cluster>;
  registerCluster(clusterId: ClusterId): Promise<Cluster>;

  // membership
  advanceMembershipRevision(): Promise<Cluster>;
  applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void>;
};

/* service */

class ClusterService implements ClusterServiceContract {
  constructor(private readonly repository: ClusterRepositoryContract) {}

  /* query methods */

  async getCluster(): Promise<Cluster> {
    const cluster = await this.repository.find();

    if (!cluster) {
      throw new GenericFailedPreconditionError('The cluster has not been initialized');
    }

    return cluster;
  }

  async captureMembershipSnapshot(): Promise<ClusterMembershipSnapshot> {
    const snapshot = await this.repository.findMembershipSnapshot();

    if (!snapshot) {
      throw new GenericFailedPreconditionError('The cluster has not been initialized');
    }

    return snapshot;
  }

  /* initialization methods */

  async initializeCluster(): Promise<Cluster> {
    const existingCluster = await this.repository.find();

    if (existingCluster) {
      return existingCluster;
    }

    try {
      return await this.repository.create({
        id: CLUSTER_RECORD_ID,
        clusterId: clusterIdSchema.parse(randomUUID())
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
        id: CLUSTER_RECORD_ID,
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

  async advanceMembershipRevision(): Promise<Cluster> {
    await this.getCluster();

    return this.repository.advanceMembershipRevision();
  }

  async applyMembershipSnapshot(snapshot: ClusterMembershipSnapshot): Promise<void> {
    const cluster = await this.getCluster();

    verifyMembershipSnapshotCluster(cluster, snapshot);

    await this.repository.applyMembershipSnapshot(snapshot);
  }
}

/* exports */

export { ClusterService };
export type { ClusterServiceContract };
