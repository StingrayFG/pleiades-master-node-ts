/* types  */

export type TaskLifecycleConfig = {
  uncommittedCleanup: {
    afterMs: number;
    batchSize: number;
  };
  payloadCleanup: {
    afterMs: number;
    batchSize: number;
  };
};

export type TaskConfig = {
  applyBatchSize: number;
  executionWaitTimeoutMs: number;

  lifecycle: TaskLifecycleConfig;
};

/* config */

export const taskConfig: TaskConfig = {
  applyBatchSize: 32,

  executionWaitTimeoutMs: 10_000,

  lifecycle: {
    uncommittedCleanup: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    },
    payloadCleanup: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    }
  }
};
