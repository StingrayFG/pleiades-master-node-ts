import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import { blobConfig } from './blob.config';

/* constants */

const GRPC_BLOB_MESSAGE_OVERHEAD_BYTES = 1024n * 1024n;

/* helpers */

const getBlobGrpcMaxMessageSizeBytes = (): number => {
  const maxMessageSizeBytes = blobConfig.maxSizeBytes + GRPC_BLOB_MESSAGE_OVERHEAD_BYTES;

  if (maxMessageSizeBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Blob gRPC message size exceeds supported numeric range');
  }

  return Number(maxMessageSizeBytes);
};

/* config */

export const blobGrpcConfig: GrpcClientConfig = {
  maxMessageSizeBytes: getBlobGrpcMaxMessageSizeBytes()
};
