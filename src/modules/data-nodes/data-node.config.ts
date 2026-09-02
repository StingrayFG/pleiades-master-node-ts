/* config */

type DataNodeLifecycleConfig = {
  offlineAfterMs: number;
  healthCheckAfterMs: number;
  healthCheckIntervalMs: number;
};

type DataNodeConfig = {
  lifecycle: DataNodeLifecycleConfig;
};

export const dataNodeConfig: DataNodeConfig = {
  lifecycle: {
    offlineAfterMs: 10 * 60 * 1000,
    healthCheckAfterMs: 60 * 60 * 1000,
    healthCheckIntervalMs: 5 * 60 * 1000
  }
};

/* exports */

export type { DataNodeConfig, DataNodeLifecycleConfig };
