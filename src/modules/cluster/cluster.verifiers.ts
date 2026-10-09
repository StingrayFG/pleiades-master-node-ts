import { isDeepStrictEqual } from 'node:util';

import { GenericConflictError } from '@/errors/application.errors';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import type { Cluster } from './cluster.domain';
import type { ClusterMembershipSnapshot } from './cluster.membership-snapshot';

/* types */

type ComparableMasterNode = Pick<
  MasterNode,
  | 'id'
  | 'certificateFingerprint'
  | 'sessionId'
  | 'state'
  | 'mode'
  | 'hostname'
  | 'port'
  | 'scheme'
  | 'registeredAt'
  | 'revision'
>;

type ComparableDataNode = Pick<
  DataNode,
  | 'id'
  | 'certificateFingerprint'
  | 'sessionId'
  | 'state'
  | 'mode'
  | 'hostname'
  | 'port'
  | 'scheme'
  | 'registeredAt'
  | 'revision'
>;

/* membership comparison */

// operational fields can change independently of the membership revision,
// so membership consistency compares only membership fields.
const toComparableMasterNode = (masterNode: MasterNode): ComparableMasterNode => ({
  id: masterNode.id,
  certificateFingerprint: masterNode.certificateFingerprint,
  sessionId: masterNode.sessionId,
  state: masterNode.state,
  mode: masterNode.mode,
  hostname: masterNode.hostname,
  port: masterNode.port,
  scheme: masterNode.scheme,
  registeredAt: masterNode.registeredAt,
  revision: masterNode.revision
});

const toComparableDataNode = (dataNode: DataNode): ComparableDataNode => ({
  id: dataNode.id,
  certificateFingerprint: dataNode.certificateFingerprint,
  sessionId: dataNode.sessionId,
  state: dataNode.state,
  mode: dataNode.mode,
  hostname: dataNode.hostname,
  port: dataNode.port,
  scheme: dataNode.scheme,
  registeredAt: dataNode.registeredAt,
  revision: dataNode.revision
});

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
  const currentMasterMembership = currentMasterNodes.map(toComparableMasterNode);
  const snapshotMasterMembership = snapshot.masterNodes
    .map(toComparableMasterNode)
    .sort((left, right) => left.id.localeCompare(right.id));

  const currentDataNodeInventory = currentDataNodes.map(toComparableDataNode);
  const snapshotDataNodeInventory = snapshot.dataNodes
    .map(toComparableDataNode)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (
    !isDeepStrictEqual(currentMasterMembership, snapshotMasterMembership) ||
    !isDeepStrictEqual(currentDataNodeInventory, snapshotDataNodeInventory)
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
