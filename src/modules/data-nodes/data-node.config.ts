/* types  */

export type DataNodeLifecycleConfig = {
  offlineAfterMs: number;
  healthCheckAfterMs: number;
  healthCheckIntervalMs: number;
};

export type DataNodeConfig = {
  lifecycle: DataNodeLifecycleConfig;
};

/* config */

export const dataNodeConfig: DataNodeConfig = {
  lifecycle: {
    offlineAfterMs: 10 * 60 * 1000,
    healthCheckAfterMs: 60 * 60 * 1000,
    healthCheckIntervalMs: 5 * 60 * 1000
  }
};
