/* types */

export type ByteStorageLifecycleConfig = {
  pendingCleanup: {
    afterMs: number;
    batchSize: number;
  };
  deletion: {
    afterMs: number;
    batchSize: number;
  };
  temporaryFileCleanup: {
    afterMs: number;
  };
};

export type ByteStorageConfig = {
  lifecycle: ByteStorageLifecycleConfig;
};

/* config */

export const byteStorageConfig: ByteStorageConfig = {
  lifecycle: {
    pendingCleanup: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    },
    deletion: {
      afterMs: 10 * 60 * 1000,
      batchSize: 32
    },
    temporaryFileCleanup: {
      afterMs: 60 * 60 * 1000
    }
  }
};
