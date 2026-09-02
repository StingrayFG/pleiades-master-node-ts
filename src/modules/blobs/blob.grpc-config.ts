import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { BlobConfig } from './blob.config';

/* constants */

const GRPC_BLOB_MESSAGE_OVERHEAD_BYTES = 1024n * 1024n;

/* factory */

const createBlobGrpcConfig = (blobConfig: BlobConfig): GrpcClientConfig => {
  const maxMessageSizeBytes = blobConfig.maxSizeBytes + GRPC_BLOB_MESSAGE_OVERHEAD_BYTES;

  if (maxMessageSizeBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Blob gRPC message size exceeds supported numeric range');
  }

  return {
    maxMessageSizeBytes: Number(maxMessageSizeBytes)
  };
};

/* exports */

export { createBlobGrpcConfig };
