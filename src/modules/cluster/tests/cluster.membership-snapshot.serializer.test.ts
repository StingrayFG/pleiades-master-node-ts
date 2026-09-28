import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import { CLUSTER_RECORD_ID } from '../cluster.domain';
import type { ClusterMembershipSnapshot } from '../cluster.membership-snapshot';
import {
  parseClusterMembershipSnapshot,
  serializeClusterMembershipSnapshot
} from '../cluster.membership-snapshot.serializer';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const snapshot: ClusterMembershipSnapshot = {
  cluster: {
    id: CLUSTER_RECORD_ID,
    clusterId: '00000000-0000-4000-8000-000000000001',
    membershipRevision: 0n,
    createdAt: now,
    updatedAt: now
  },
  masterNodes: [
    {
      id: 'master-node-a',

      certificateFingerprint: 'ab'.repeat(32),
      sessionId: '00000000-0000-4000-8000-000000000002',
      state: 'active',
      mode: 'serving',

      hostname: 'master-node-a.internal',
      port: 4410,
      scheme: 'grpcs',

      registeredAt: now,
      lastContactAt: now,
      lastHealthCheckAt: null,
      lastHeartbeatAt: null,
      updatedAt: now,

      revision: 2n
    }
  ],
  dataNodes: [
    {
      id: 'data-node-a',

      certificateFingerprint: 'ef'.repeat(32),
      sessionId: '00000000-0000-4000-8000-000000000003',
      lastHeartbeatSequence: 3n,
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

      revision: 4n
    }
  ]
};

/* tests */

describe('cluster membership snapshot serializer', () => {
  test('round-trips a cluster membership snapshot through its wire representation', () => {
    expect(parseClusterMembershipSnapshot(serializeClusterMembershipSnapshot(snapshot))).toEqual(snapshot);
  });

  test('rejects malformed serialized cluster membership snapshots', () => {
    expect(() => parseClusterMembershipSnapshot(Buffer.from('{"cluster":null}'))).toThrow(GenericMapperError);
  });
});
