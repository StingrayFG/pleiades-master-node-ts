import type {
  EnsureBlobExistsInput,
  GetBlobClientInput,
  GetBlobInput,
  GetBlobMetadataInput,
  HeadBlobClientInput,
  PutBlobClientInput
} from './blob.application';
import type { BlobMetadata, BlobMetadataWithBytes } from './blob.domain';
import type { BlobGrpcClientContract } from './blob.grpc-client';
import { verifyGetBlobMetadataResult, verifyGetBlobResult, verifyEnsureBlobExistsResult } from './blob.verifiers';

/* contract */

type BlobServiceContract = {
  getBlobMetadata(input: GetBlobMetadataInput): Promise<BlobMetadata>;
  getBlob(input: GetBlobInput): Promise<BlobMetadataWithBytes>;
  ensureBlobExists(input: EnsureBlobExistsInput): Promise<BlobMetadata>;
};

/* service */

class BlobService implements BlobServiceContract {
  constructor(private readonly grpcClient: BlobGrpcClientContract) {}

  async getBlobMetadata(input: GetBlobMetadataInput): Promise<BlobMetadata> {
    const clientInput: HeadBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const result = await this.grpcClient.headBlob(clientInput);

    verifyGetBlobMetadataResult(input, result);

    return result;
  }

  async getBlob(input: GetBlobInput): Promise<BlobMetadataWithBytes> {
    const clientInput: GetBlobClientInput = {
      blobId: input.blobId,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const result = await this.grpcClient.getBlob(clientInput);

    verifyGetBlobResult(input, result);

    return result;
  }

  async ensureBlobExists(input: EnsureBlobExistsInput): Promise<BlobMetadata> {
    const clientInput: PutBlobClientInput = {
      blob: input.blob,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const result = await this.grpcClient.putBlob(clientInput);

    verifyEnsureBlobExistsResult(input, result);

    return result;
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
