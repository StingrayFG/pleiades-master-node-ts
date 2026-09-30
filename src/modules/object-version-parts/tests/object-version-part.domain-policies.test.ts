import { describe, expect, test } from '@jest/globals';

import type { DataNode } from '@/modules/data-nodes/data-node.domain';

import { calculatePartPlacementGroup, selectResponsibleDataNodes } from '../object-version-part.domain-policies';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const createDataNode = (id: string): DataNode => ({
  id,
  certificateFingerprint: 'fingerprint',
  sessionId: '00000000-0000-4000-8000-000000000001',
  lastHeartbeatSequence: 1n,
  state: 'active',
  mode: 'serving',
  hostname: `${id}.internal`,
  port: 50051,
  scheme: 'grpcs',
  storageTotalBytes: 1_000n,
  storageFreeBytes: 500n,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: now,
  lastHeartbeatAt: now,
  updatedAt: now,
  revision: 0n
});

/* tests */

describe('object version part domain policies', () => {
  test('calculates a stable placement group within the configured range', () => {
    const blobId = '00000000-0000-4000-8000-000000000001';
    const placementGroup = calculatePartPlacementGroup(blobId, 64);

    expect(placementGroup).toBe(calculatePartPlacementGroup(blobId, 64));
    expect(placementGroup).toBeGreaterThanOrEqual(0);
    expect(placementGroup).toBeLessThan(64);
  });

  test('selects a deterministic responsible subset without mutating candidates', () => {
    const candidates = [createDataNode('node-c'), createDataNode('node-a'), createDataNode('node-b')];
    const originalOrder = candidates.map(({ id }) => id);

    const first = selectResponsibleDataNodes(7, 2, candidates);
    const second = selectResponsibleDataNodes(7, 2, [...candidates].reverse());

    expect(first).toHaveLength(2);
    expect(new Set(first.map(({ id }) => id)).size).toBe(2);
    expect(second.map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect(candidates.map(({ id }) => id)).toEqual(originalOrder);
  });

  test('returns every candidate when replication exceeds candidate count', () => {
    const candidates = [createDataNode('node-a'), createDataNode('node-b')];

    expect(selectResponsibleDataNodes(2, 3, candidates)).toHaveLength(2);
  });
});
