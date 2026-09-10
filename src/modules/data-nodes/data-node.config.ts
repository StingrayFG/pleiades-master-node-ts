/* types  */

export type DataNodeRegistrationConfig = {
  maxAttempts: number;
};

export type DataNodeLifecycleConfig = {
  offlineAfterMs: number;
  healthCheckAfterMs: number;
  healthCheckIntervalMs: number;
};

export type DataNodeConfig = {
  registration: DataNodeRegistrationConfig;
  lifecycle: DataNodeLifecycleConfig;
};

/* config */

export const dataNodeConfig: DataNodeConfig = {
  registration: {
    maxAttempts: 3
  },

  lifecycle: {
    offlineAfterMs: 10 * 60 * 1000,
    healthCheckAfterMs: 60 * 60 * 1000,
    healthCheckIntervalMs: 5 * 60 * 1000
  }
};
