/* types  */

export type TaskConfig = {
  applyBatchSize: number;
  executionWaitTimeoutMs: number;
};

/* config */

export const taskConfig: TaskConfig = {
  applyBatchSize: 32,

  executionWaitTimeoutMs: 10_000
};
