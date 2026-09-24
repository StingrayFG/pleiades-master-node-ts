import { describe, expect, test } from '@jest/globals';

import { CLUSTER_RECORD_ID, clusterSchema } from '../cluster.domain';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

/* tests */

describe('cluster domain', () => {
  test('accepts a singleton cluster with a UUID identity', () => {
    expect(
      clusterSchema.parse({
        id: CLUSTER_RECORD_ID,
        clusterId: '00000000-0000-4000-8000-000000000001',
        createdAt: now,
        updatedAt: now
      })
    ).toEqual({
      id: CLUSTER_RECORD_ID,
      clusterId: '00000000-0000-4000-8000-000000000001',
      createdAt: now,
      updatedAt: now
    });
  });

  test('rejects a cluster row with a non-singleton record id', () => {
    expect(
      clusterSchema.safeParse({
        id: 'another-cluster-row',
        clusterId: '00000000-0000-4000-8000-000000000001',
        createdAt: now,
        updatedAt: now
      }).success
    ).toBe(false);
  });

  test('rejects a non-UUID cluster identity', () => {
    expect(
      clusterSchema.safeParse({
        id: CLUSTER_RECORD_ID,
        clusterId: 'development-cluster',
        createdAt: now,
        updatedAt: now
      }).success
    ).toBe(false);
  });
});
