import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from './blob.application';
import type { BlobConfig } from './blob.config';
import type { BlobMetadata, BlobMetadataWithBytes } from './blob.domain';
import type { BlobGrpcClientContract } from './blob.grpc-client';
import {
  deleteBlobTaskDefinition,
  ensureBlobExistsTaskDefinition,
  type DeleteBlobTaskData,
  type EnsureBlobExistsTaskData
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
    const headBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blobMetadata = await this.grpcClient.headBlob(headBlobClientInput);

    verifyBlobMetadataIdentity(input.blobId, blobMetadata);

    return blobMetadata;
  }

  async getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes> {
    const getBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.getBlob(getBlobClientInput);

    verifyBlobIntegrity(input.blobId, blob);

    return blob;
  }

  async verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const verifyBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.verifyBlob(verifyBlobClientInput);

    verifyBlobMetadataIdentity(input.blobId, blob);

    return blob;
  }

  async ensureBlobExists(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    verifySuppliedBlobIntegrity(input.blob, this.blobConfig.maxSizeBytes);

    const taskData: EnsureBlobExistsTaskData = {
      blob: input.blob,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blobMetadata = await this.taskService.executeTaskByDefinition(ensureBlobExistsTaskDefinition, taskData);

    verifyBlobMetadataMatch(input.blob, blobMetadata);

    return blobMetadata;
  }

  async deleteBlob(input: DataNodeBlobInput): Promise<void> {
    const taskData: DeleteBlobTaskData = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    await this.taskService.executeTaskByDefinition(deleteBlobTaskDefinition, taskData);
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
