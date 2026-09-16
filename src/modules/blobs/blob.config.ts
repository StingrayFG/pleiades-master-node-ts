/* types */

export type BlobConfig = {
  maxSizeBytes: bigint;
  maxPutAttempts: number;
};

/* config */

export const blobConfig: BlobConfig = {
  maxSizeBytes: 10n * 1024n * 1024n,

  maxPutAttempts: 3
};
