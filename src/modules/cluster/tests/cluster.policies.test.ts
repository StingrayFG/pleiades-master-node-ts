import { describe, expect, test } from '@jest/globals';

import { resolveMembershipSnapshotAction } from '../cluster.policies';

/* tests */

describe('resolveMembershipSnapshotAction', () => {
  test('ignores snapshots older than the local membership revision', () => {
    expect(resolveMembershipSnapshotAction(2n, 1n)).toBe('ignore');
  });

  test('reconciles snapshots matching the local membership revision', () => {
    expect(resolveMembershipSnapshotAction(2n, 2n)).toBe('reconcile');
  });

  test('applies snapshots newer than the local membership revision', () => {
    expect(resolveMembershipSnapshotAction(2n, 3n)).toBe('apply');
  });
});
