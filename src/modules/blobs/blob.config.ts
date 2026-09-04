/* types */

export type BlobConfig = {
  maxSizeBytes: bigint;
};

/* config */

export const blobConfig: BlobConfig = {
  maxSizeBytes: 10n * 1024n * 1024n
};
