import { describe, expect, test } from '@jest/globals';

import { GenericConflictError } from '@/errors/application.errors';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import type { ClusterMembershipSnapshot } from '../cluster.membership-snapshot';
import {
  verifyClusterRegistered,
  verifyMembershipSnapshotCluster,
  verifyMembershipSnapshotConsistent,
  verifyMembershipSnapshotPreservesCertificates
} from '../cluster.verifiers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000001',
  membershipRevision: 1n,
  createdAt: now,
  updatedAt: now
};

const masterNode: MasterNode = {
  id: 'master-node-aaaaaaaaaaaa',
  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: 'master-node-a.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const dataNode: DataNode = {
  id: 'data-node-a',
  certificateFingerprint: 'ef'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000002',
  lastHeartbeatSequence: 2n,
  state: 'active',
  mode: 'serving',
  hostname: 'data-node-a.internal',
  port: 4420,
  scheme: 'grpcs',
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: now,
  updatedAt: now,
  revision: 2n
};

const snapshot: ClusterMembershipSnapshot = {
  cluster,
  masterNodes: [masterNode],
  dataNodes: [dataNode]
};

/* tests */

describe('verifyClusterRegistered', () => {
  test('accepts a registered cluster', () => {
    expect(() => verifyClusterRegistered(cluster)).not.toThrow();
  });

  test('rejects a missing cluster', () => {
    expect(() => verifyClusterRegistered(null)).toThrow(GenericConflictError);
  });
});

describe('verifyMembershipSnapshotCluster', () => {
  test('accepts a snapshot for the local cluster', () => {
    expect(() => verifyMembershipSnapshotCluster(cluster, snapshot)).not.toThrow();
  });

  test('rejects a snapshot for a different cluster', () => {
    expect(() =>
      verifyMembershipSnapshotCluster(cluster, {
        ...snapshot,
        cluster: { ...cluster, clusterId: '00000000-0000-4000-8000-000000000099' }
      })
    ).toThrow(GenericConflictError);
  });
});

describe('verifyMembershipSnapshotConsistent', () => {
  test('accepts a snapshot matching the local inventory in any order', () => {
    expect(() => verifyMembershipSnapshotConsistent([masterNode], [dataNode], snapshot)).not.toThrow();
  });

  test('rejects a snapshot with diverging master nodes', () => {
    expect(() =>
      verifyMembershipSnapshotConsistent([masterNode], [dataNode], { ...snapshot, masterNodes: [] })
    ).toThrow(GenericConflictError);
  });

  test('rejects a snapshot with diverging data nodes', () => {
    expect(() => verifyMembershipSnapshotConsistent([masterNode], [dataNode], { ...snapshot, dataNodes: [] })).toThrow(
      GenericConflictError
    );
  });
});

describe('verifyMembershipSnapshotPreservesCertificates', () => {
  test('accepts a snapshot preserving existing node certificates', () => {
    expect(() => verifyMembershipSnapshotPreservesCertificates([masterNode], [dataNode], snapshot)).not.toThrow();
  });

  test('accepts snapshots adding new nodes', () => {
    expect(() => verifyMembershipSnapshotPreservesCertificates([], [], snapshot)).not.toThrow();
  });

  test('rejects a snapshot changing a master node certificate', () => {
    expect(() =>
      verifyMembershipSnapshotPreservesCertificates([masterNode], [], {
        ...snapshot,
        masterNodes: [{ ...masterNode, certificateFingerprint: 'cd'.repeat(32) }],
        dataNodes: []
      })
    ).toThrow(GenericConflictError);
  });

  test('rejects a snapshot changing a data node certificate', () => {
    expect(() =>
      verifyMembershipSnapshotPreservesCertificates([], [dataNode], {
        ...snapshot,
        masterNodes: [],
        dataNodes: [{ ...dataNode, certificateFingerprint: '12'.repeat(32) }]
      })
    ).toThrow(GenericConflictError);
  });
});
