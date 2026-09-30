import { describe, expect, test } from '@jest/globals';

import type { DataNodeHealthSnapshot } from '../data-node.domain';
import { resolveDataNodeState } from '../data-node.policies';

/* fixtures */

const healthSnapshot: DataNodeHealthSnapshot = {
  status: 'healthy',
  databaseOk: true,
  storageOk: true,
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  message: 'healthy'
};

/* tests */

describe('resolveDataNodeState', () => {
  test('resolves a healthy data node to active', () => {
    expect(resolveDataNodeState(healthSnapshot)).toBe('active');
  });

  test.each([
    { databaseOk: false, storageOk: true },
    { databaseOk: true, storageOk: false },
    { databaseOk: false, storageOk: false }
  ])('resolves failed dependencies to failed', ({ databaseOk, storageOk }) => {
    expect(
      resolveDataNodeState({
        ...healthSnapshot,
        databaseOk,
        storageOk
      })
    ).toBe('failed');
  });

  test('resolves a degraded data node to failed', () => {
    expect(
      resolveDataNodeState({
        ...healthSnapshot,
        status: 'degraded'
      })
    ).toBe('failed');
  });
});
