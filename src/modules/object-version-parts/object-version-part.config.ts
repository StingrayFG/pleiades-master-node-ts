/* config */

type PartRepairConfig = {
  afterMs: number;
  batchSize: number;
  concurrency: number;
};

type PartReconciliationConfig = {
  afterMs: number;
  maxAgeMs: number;
  batchSize: number;
};

type PartVerificationConfig = {
  afterMs: number;
  batchSize: number;
};

type PartDeletionConfig = {
  afterMs: number;
  batchSize: number;
};

type PartLifecycleConfig = {
  repair: PartRepairConfig;
  reconciliation: PartReconciliationConfig;
  verification: PartVerificationConfig;
  deletion: PartDeletionConfig;
};

type PartConfig = {
  placementGroupCount: number;
  replicationFactor: number;
  lifecycle: PartLifecycleConfig;
};

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

/* exports */

export type {
  PartConfig,
  PartLifecycleConfig,
  PartDeletionConfig,
  PartReconciliationConfig,
  PartRepairConfig,
  PartVerificationConfig
};
