import { BlobGrpcClient } from './blob.grpc-client';
import { BlobService } from './blob.service';

/* contract */

type BlobModule = {
  service: BlobService;
};

/* module */

const createBlobModule = (): BlobModule => {
  const grpcClient = new BlobGrpcClient();

  const service = new BlobService(grpcClient);

  return {
    service
  };
};

/* exports */

export { createBlobModule };
export type { BlobModule };
