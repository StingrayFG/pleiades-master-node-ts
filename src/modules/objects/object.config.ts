/* types */

export type ObjectLifecycleConfig = {
  pendingCleanupAfterMs: number;
  pendingCleanupBatchSize: number;
  deletionCleanupBatchSize: number;
};

export type ObjectConfig = {
  lifecycle: ObjectLifecycleConfig;
};

/* config */

export const objectConfig: ObjectConfig = {
  lifecycle: {
    pendingCleanupAfterMs: 60 * 60 * 1000,
    pendingCleanupBatchSize: 32,
    deletionCleanupBatchSize: 32
  }
};
