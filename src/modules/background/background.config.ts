/* config */

type BackgroundWorkerConfig = {
  dataNodeLifecycleIntervalMs: number;
  objectVersionPartLifecycleIntervalMs: number;
  objectLifecycleIntervalMs: number;
};

type BackgroundConfig = {
  worker: BackgroundWorkerConfig;
};

export const backgroundConfig: BackgroundConfig = {
  worker: {
    dataNodeLifecycleIntervalMs: 60_000,
    objectVersionPartLifecycleIntervalMs: 60_000,
    objectLifecycleIntervalMs: 60_000
  }
};

/* exports */

export type { BackgroundConfig, BackgroundWorkerConfig };
