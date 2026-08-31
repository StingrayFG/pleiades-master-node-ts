import type {
  DeleteBlobClientInput,
  DeleteBlobInput,
  EnsureBlobExistsInput,
  GetBlobClientInput,
  GetBlobInput,
  GetBlobMetadataInput,
  HeadBlobClientInput,
  PutBlobClientInput,
  VerifyBlobClientInput,
  VerifyBlobInput
} from './blob.application';
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
  getBlobMetadata(input: GetBlobMetadataInput): Promise<BlobMetadata>;
  getBlob(input: GetBlobInput): Promise<BlobMetadataWithBytes>;
  verifyBlob(input: VerifyBlobInput): Promise<BlobMetadata>;
  ensureBlobExists(input: EnsureBlobExistsInput): Promise<BlobMetadata>;
  deleteBlob(input: DeleteBlobInput): Promise<void>;
};

/* service */

class BlobService implements BlobServiceContract {
  constructor(private readonly grpcClient: BlobGrpcClientContract) {}

  async getBlobMetadata(input: GetBlobMetadataInput): Promise<BlobMetadata> {
    const headBlobClientInput: HeadBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.headBlob(headBlobClientInput);

    verifyGetBlobMetadataResult(input, blob);

    return blob;
  }

  async getBlob(input: GetBlobInput): Promise<BlobMetadataWithBytes> {
    const getBlobClientInput: GetBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.getBlob(getBlobClientInput);

    verifyGetBlobResult(input, blob);

    return blob;
  }

  async verifyBlob(input: VerifyBlobInput): Promise<BlobMetadata> {
    const verifyBlobClientInput: VerifyBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.verifyBlob(verifyBlobClientInput);

    verifyBlobResult(input, blob);

    return blob;
  }

  async ensureBlobExists(input: EnsureBlobExistsInput): Promise<BlobMetadata> {
    verifyEnsureBlobExistsInput(input);

    const putBlobClientInput: PutBlobClientInput = {
      blob: input.blob,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.putBlob(putBlobClientInput);

    verifyEnsureBlobExistsResult(input, blob);

    return blob;
  }

  async deleteBlob(input: DeleteBlobInput): Promise<void> {
    const deleteBlobClientInput: DeleteBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    await this.grpcClient.deleteBlob(deleteBlobClientInput);
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
