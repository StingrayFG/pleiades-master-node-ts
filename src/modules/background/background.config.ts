/* types  */

export type BackgroundWorkerConfig = {
  taskApplyIntervalMs: number;
  taskLifecycleIntervalMs: number;
  masterNodeLifecycleIntervalMs: number;
  electionCommitmentIntervalMs: number;
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

    masterNodeLifecycleIntervalMs: 1_000,
    electionCommitmentIntervalMs: 250,

    byteStorageLifecycleIntervalMs: 60_000,
    dataNodeLifecycleIntervalMs: 60_000,
    objectVersionPartLifecycleIntervalMs: 60_000,
    objectLifecycleIntervalMs: 60_000
  }
};
