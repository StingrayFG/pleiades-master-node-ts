import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from './blob.application';
import type { BlobConfig } from './blob.config';
import type { BlobMetadata, BlobMetadataWithBytes } from './blob.domain';
import type { BlobGrpcClientContract } from './blob.grpc-client';
import {
  verifyBlobResult,
  verifyEnsureBlobExistsInput,
  verifyEnsureBlobExistsResult,
  verifyGetBlobMetadataResult,
  verifyGetBlobResult
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
    private readonly blobConfig: BlobConfig
  ) {}

  async getBlobMetadata(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const headBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.headBlob(headBlobClientInput);

    verifyGetBlobMetadataResult(input, blob);

    return blob;
  }

  async getBlob(input: DataNodeBlobInput): Promise<BlobMetadataWithBytes> {
    const getBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.getBlob(getBlobClientInput);

    verifyGetBlobResult(input, blob);

    return blob;
  }

  async verifyBlob(input: DataNodeBlobInput): Promise<BlobMetadata> {
    const verifyBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.verifyBlob(verifyBlobClientInput);

    verifyBlobResult(input, blob);

    return blob;
  }

  async ensureBlobExists(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    verifyEnsureBlobExistsInput(input, this.blobConfig.maxSizeBytes);

    const putBlobClientInput: DataNodeBlobWithBytesInput = {
      blob: input.blob,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.putBlob(putBlobClientInput);

    verifyEnsureBlobExistsResult(input, blob);

    return blob;
  }

  async deleteBlob(input: DataNodeBlobInput): Promise<void> {
    const deleteBlobClientInput: DataNodeBlobInput = {
      blobId: input.blobId,

      dataNodeEndpoint: input.dataNodeEndpoint
    };

    await this.grpcClient.deleteBlob(deleteBlobClientInput);
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
