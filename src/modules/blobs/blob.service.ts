import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from './blob.application';
import type { BlobConfig } from './blob.config';
import type { BlobMetadata, BlobMetadataWithBytes } from './blob.domain';
import type { BlobGrpcClientContract } from './blob.grpc-client';
import {
  deleteBlobTaskDefinition,
  ensureBlobExistsTaskDefinition
} from './blob.tasks';
import {
  verifyBlobIntegrity,
  verifyBlobMetadataIdentity,
  verifyBlobMetadataMatch,
  verifySuppliedBlobIntegrity
} from './blob.verifiers';

/* contract */

type BlobServiceContract = {
  getBlobMetadata(input: DataNodeBlobInput): Promise<BlobMetadata>;
  getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes>;
  verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata>;
  ensureBlobExists(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata>;
  deleteBlob(input: DataNodeBlobInput): Promise<void>;
};

/* service */

class BlobService implements BlobServiceContract {
  constructor(
    private readonly grpcClient: BlobGrpcClientContract,
    private readonly blobConfig: BlobConfig,
    private readonly taskService: TaskServiceContract
  ) {}

  async getBlobMetadata(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const blobMetadata = await this.grpcClient.headBlob({
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    });

    verifyBlobMetadataIdentity(input.blobId, blobMetadata);

    return blobMetadata;
  }

  async getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes> {
    const blob = await this.grpcClient.getBlob({
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    });

    verifyBlobIntegrity(input.blobId, blob);

    return blob;
  }

  async verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const blob = await this.grpcClient.verifyBlob({
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    });

    verifyBlobMetadataIdentity(input.blobId, blob);

    return blob;
  }

  async ensureBlobExists(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    verifySuppliedBlobIntegrity(input.blob, this.blobConfig.maxSizeBytes);

    const blobMetadata = await this.taskService.executeTaskByDefinition(ensureBlobExistsTaskDefinition, {
      blob: input.blob,

      dataNodeEndpoint: input.dataNodeEndpoint
    });

    verifyBlobMetadataMatch(input.blob, blobMetadata);

    return blobMetadata;
  }

  async deleteBlob(input: DataNodeBlobInput): Promise<void> {
    await this.taskService.executeTaskByDefinition(deleteBlobTaskDefinition, {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    });
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
