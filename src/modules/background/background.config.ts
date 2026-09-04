/* types  */

export type BackgroundWorkerConfig = {
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
    dataNodeLifecycleIntervalMs: 60_000,
    objectVersionPartLifecycleIntervalMs: 60_000,
    objectLifecycleIntervalMs: 60_000
  }
};
