/* types */

export type PartRepairConfig = {
  afterMs: number;
  batchSize: number;
  concurrency: number;
};

export type PartReconciliationConfig = {
  afterMs: number;
  maxAgeMs: number;
  batchSize: number;
};

export type PartVerificationConfig = {
  afterMs: number;
  batchSize: number;
};

export type PartDeletionConfig = {
  afterMs: number;
  batchSize: number;
};

export type PartLifecycleConfig = {
  repair: PartRepairConfig;
  reconciliation: PartReconciliationConfig;
  verification: PartVerificationConfig;
  deletion: PartDeletionConfig;
};

export type PartConfig = {
  placementGroupCount: number;
  replicationFactor: number;
  lifecycle: PartLifecycleConfig;
};

/* config */

export const partConfig: PartConfig = {
  placementGroupCount: 64,
  replicationFactor: 3,

  lifecycle: {
    repair: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32,
      concurrency: 4
    },
    reconciliation: {
      afterMs: 10 * 60 * 1000,
      maxAgeMs: 60 * 60 * 1000,
      batchSize: 32
    },
    verification: {
      afterMs: 24 * 60 * 60 * 1000,
      batchSize: 32
    },
    deletion: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    }
  }
};
