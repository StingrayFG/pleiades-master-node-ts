import type { ClusterMembershipRevision } from './cluster.domain';

/* types */

export type MembershipSnapshotAction = 'ignore' | 'reconcile' | 'apply';

/* policies */

// an older snapshot carries no new information, an equal revision must match the
// local inventory exactly, and only a newer revision is applied.
export const resolveMembershipSnapshotAction = (
  currentRevision: ClusterMembershipRevision,
  snapshotRevision: ClusterMembershipRevision
): MembershipSnapshotAction => {
  if (currentRevision > snapshotRevision) {
    return 'ignore';
  }

  if (currentRevision === snapshotRevision) {
    return 'reconcile';
  }

  return 'apply';
};
