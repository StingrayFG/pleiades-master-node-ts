/* types  */

export type TaskLifecycleConfig = {
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
    payloadCleanup: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    }
  }
};
