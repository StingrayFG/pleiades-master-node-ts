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
  id: 'master-node-a',

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

/* tests */

describe('cluster membership snapshot', () => {
  test('accepts unique master node membership', () => {
    expect(
      clusterMembershipSnapshotSchema.parse({
        cluster,
        masterNodes: [masterNode]
      })
    ).toEqual({
      cluster,
      masterNodes: [masterNode]
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
        ]
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
            id: 'master-node-b'
          }
        ]
      }).success
    ).toBe(false);
  });
});
