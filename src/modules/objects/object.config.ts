/* config */

type ObjectLifecycleConfig = {
  pendingCleanupAfterMs: number;
  pendingCleanupBatchSize: number;
  deletionCleanupBatchSize: number;
};

type ObjectConfig = {
  lifecycle: ObjectLifecycleConfig;
};

export const objectConfig: ObjectConfig = {
  lifecycle: {
    pendingCleanupAfterMs: 60 * 60 * 1000,
    pendingCleanupBatchSize: 32,
    deletionCleanupBatchSize: 32
  }
};

/* exports */

export type { ObjectConfig, ObjectLifecycleConfig };
