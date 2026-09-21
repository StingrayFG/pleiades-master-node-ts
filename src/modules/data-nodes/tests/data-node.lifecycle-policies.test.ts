import { describe, expect, test } from '@jest/globals';

import { dataNodeConfig } from '../data-node.config';
import type { DataNode } from '../data-node.domain';
import {
  resolveDataNodeStateFromContactSilence,
  shouldCheckDataNodeHealth
} from '../lifecycle/data-node.lifecycle-policies';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const dataNode: DataNode = {
  id: 'data-node-1',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  lastHeartbeatSequence: 2n,
  state: 'active',
  mode: 'serving',

  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',

  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,

  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: now,
  updatedAt: now,

  revision: 3n
};

const subtractMilliseconds = (date: Date, milliseconds: number): Date => {
  return new Date(date.getTime() - milliseconds);
};

/* tests */

describe('data node lifecycle policies', () => {
  describe('shouldCheckDataNodeHealth', () => {
    test('does not check health before the contact-silence threshold', () => {
      const silentDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs - 1)
      };

      expect(shouldCheckDataNodeHealth(silentDataNode, now)).toBe(false);
    });

    test('checks health at the contact-silence threshold when no check was recorded', () => {
      const silentDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs)
      };

      expect(shouldCheckDataNodeHealth(silentDataNode, now)).toBe(true);
    });

    test('does not repeat a recent health check', () => {
      const silentDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs),
        lastHealthCheckAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckIntervalMs - 1)
      };

      expect(shouldCheckDataNodeHealth(silentDataNode, now)).toBe(false);
    });

    test('repeats a health check at the health-check interval', () => {
      const silentDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckAfterMs),
        lastHealthCheckAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.healthCheckIntervalMs)
      };

      expect(shouldCheckDataNodeHealth(silentDataNode, now)).toBe(true);
    });
  });

  describe('resolveDataNodeStateFromContactSilence', () => {
    test('preserves state before the offline threshold', () => {
      const recentlySeenDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.offlineAfterMs - 1)
      };

      expect(resolveDataNodeStateFromContactSilence(recentlySeenDataNode, now)).toBe('active');
    });

    test('resolves an active node to offline at the silence threshold', () => {
      const silentDataNode: DataNode = {
        ...dataNode,
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.offlineAfterMs)
      };

      expect(resolveDataNodeStateFromContactSilence(silentDataNode, now)).toBe('offline');
    });

    test('preserves failed state after the silence threshold', () => {
      const failedDataNode: DataNode = {
        ...dataNode,
        state: 'failed',
        lastContactAt: subtractMilliseconds(now, dataNodeConfig.lifecycle.offlineAfterMs)
      };

      expect(resolveDataNodeStateFromContactSilence(failedDataNode, now)).toBe('failed');
    });

    test('does not treat a future contact timestamp as silence', () => {
      const futureDataNode: DataNode = {
        ...dataNode,
        lastContactAt: new Date(now.getTime() + dataNodeConfig.lifecycle.offlineAfterMs)
      };

      expect(resolveDataNodeStateFromContactSilence(futureDataNode, now)).toBe('active');
    });
  });
});
