import { describe, expect, test } from '@jest/globals';

import { CLUSTER_RECORD_ID, type Cluster } from '../cluster.domain';
import { clusterMembershipSnapshotSchema } from '../cluster.membership-snapshot';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000001',
  membershipRevision: 1n,
  createdAt: now,
  updatedAt: now
};

const masterNode = {
  id: 'master-node-aaaaaaaaaaaa',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active' as const,
  mode: 'serving' as const,

  hostname: 'master-node-a.internal',
  port: 4410,
  scheme: 'grpcs' as const,

  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,

  revision: 1n
};

const dataNode = {
  id: 'data-node-a',

  certificateFingerprint: 'ef'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000002',
  lastHeartbeatSequence: 1n,
  state: 'active' as const,
  mode: 'serving' as const,

  hostname: 'data-node-a.internal',
  port: 4420,
  scheme: 'grpcs' as const,

  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,

  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: now,
  updatedAt: now,

  revision: 2n
};

/* tests */

describe('cluster membership snapshot', () => {
  test('accepts unique master node membership', () => {
    expect(
      clusterMembershipSnapshotSchema.parse({
        cluster,
        masterNodes: [masterNode],
        dataNodes: [dataNode]
      })
    ).toEqual({
      cluster,
      masterNodes: [masterNode],
      dataNodes: [dataNode]
    });
  });

  test('rejects duplicate master node ids', () => {
    expect(
      clusterMembershipSnapshotSchema.safeParse({
        cluster,
        masterNodes: [
          masterNode,
          {
            ...masterNode,
            certificateFingerprint: 'cd'.repeat(32)
          }
        ],
        dataNodes: [dataNode]
      }).success
    ).toBe(false);
  });

  test('rejects duplicate master node certificates', () => {
    expect(
      clusterMembershipSnapshotSchema.safeParse({
        cluster,
        masterNodes: [
          masterNode,
          {
            ...masterNode,
            id: 'master-node-bbbbbbbbbbbb'
          }
        ],
        dataNodes: [dataNode]
      }).success
    ).toBe(false);
  });

  test('rejects duplicate data node ids', () => {
    expect(
      clusterMembershipSnapshotSchema.safeParse({
        cluster,
        masterNodes: [masterNode],
        dataNodes: [
          dataNode,
          {
            ...dataNode,
            certificateFingerprint: '12'.repeat(32)
          }
        ]
      }).success
    ).toBe(false);
  });

  test('rejects duplicate data node certificates', () => {
    expect(
      clusterMembershipSnapshotSchema.safeParse({
        cluster,
        masterNodes: [masterNode],
        dataNodes: [
          dataNode,
          {
            ...dataNode,
            id: 'data-node-b'
          }
        ]
      }).success
    ).toBe(false);
  });
});
