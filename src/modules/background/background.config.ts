/* types  */

export type BackgroundWorkerConfig = {
  taskApplyIntervalMs: number;
  taskLifecycleIntervalMs: number;
  masterReplicationIntervalMs: number;
  electionIntervalMs: number;
  byteStorageLifecycleIntervalMs: number;
  dataNodeLifecycleIntervalMs: number;
  objectVersionPartLifecycleIntervalMs: number;
  objectLifecycleIntervalMs: number;
};

export type BackgroundConfig = {
  worker: BackgroundWorkerConfig;
};

/* config */

export const backgroundConfig: BackgroundConfig = {
  worker: {
    taskApplyIntervalMs: 5_000,
    taskLifecycleIntervalMs: 60_000,

    masterReplicationIntervalMs: 2_000,
    electionIntervalMs: 1_000,

    byteStorageLifecycleIntervalMs: 60_000,
    dataNodeLifecycleIntervalMs: 60_000,
    objectVersionPartLifecycleIntervalMs: 60_000,
    objectLifecycleIntervalMs: 60_000
  }
};
