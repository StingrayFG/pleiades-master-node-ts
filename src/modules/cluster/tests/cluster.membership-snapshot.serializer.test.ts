import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import { CLUSTER_RECORD_ID } from '../cluster.domain';
import {
  parseClusterMembershipSnapshot,
  serializeClusterMembershipSnapshot
} from '../cluster.membership-snapshot.serializer';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const snapshot = {
  cluster: {
    id: CLUSTER_RECORD_ID,
    clusterId: '00000000-0000-4000-8000-000000000001',
    membershipRevision: 0n,
    createdAt: now,
    updatedAt: now
  },
  masterNodes: []
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
