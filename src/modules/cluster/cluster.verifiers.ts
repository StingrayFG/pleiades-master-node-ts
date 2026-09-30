import { isDeepStrictEqual } from 'node:util';

import { GenericConflictError } from '@/errors/application.errors';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import type { Cluster } from './cluster.domain';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';

/* verifiers */

export const verifyClusterRegistered: (cluster: Cluster | null) => asserts cluster is Cluster = (cluster) => {
  if (!cluster) {
    throw new GenericConflictError('The local cluster has not been registered');
  }
};

export const verifyMembershipSnapshotCluster = (cluster: Cluster, snapshot: ClusterMembershipSnapshot): void => {
  if (cluster.clusterId !== snapshot.cluster.clusterId) {
    throw new GenericConflictError('Cluster membership snapshot belongs to a different cluster');
  }
};

export const verifyMembershipSnapshotConsistent = (
  currentMasterNodes: MasterNode[],
  currentDataNodes: DataNode[],
  snapshot: ClusterMembershipSnapshot
): void => {
  const snapshotMasterNodes = [...snapshot.masterNodes].sort((left, right) => left.id.localeCompare(right.id));
  const snapshotDataNodes = [...snapshot.dataNodes].sort((left, right) => left.id.localeCompare(right.id));

  if (
    !isDeepStrictEqual(currentMasterNodes, snapshotMasterNodes) ||
    !isDeepStrictEqual(currentDataNodes, snapshotDataNodes)
  ) {
    throw new GenericConflictError(
      'Cluster membership snapshot conflicts with the local cluster inventory at the same revision'
    );
  }
};

export const verifyMembershipSnapshotPreservesCertificates = (
  existingMasterNodes: MasterNode[],
  existingDataNodes: DataNode[],
  snapshot: ClusterMembershipSnapshot
): void => {
  for (const existingMasterNode of existingMasterNodes) {
    const snapshotMasterNode = snapshot.masterNodes.find((masterNode) => masterNode.id === existingMasterNode.id);

    if (snapshotMasterNode?.certificateFingerprint !== existingMasterNode.certificateFingerprint) {
      throw new GenericConflictError('Cluster membership snapshot changes an existing master node certificate');
    }
  }

  for (const existingDataNode of existingDataNodes) {
    const snapshotDataNode = snapshot.dataNodes.find((dataNode) => dataNode.id === existingDataNode.id);

    if (snapshotDataNode?.certificateFingerprint !== existingDataNode.certificateFingerprint) {
      throw new GenericConflictError('Cluster membership snapshot changes an existing data node certificate');
    }
  }
};
