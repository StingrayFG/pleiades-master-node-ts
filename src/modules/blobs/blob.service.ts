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

  async ensureBlobExists(input: EnsureBlobExistsInput): Promise<BlobMetadata> {
    const putBlobClientInput: PutBlobClientInput = {
      blob: input.blob,
      dataNodeEndpoint: input.dataNodeEndpoint
    };

    const blob = await this.grpcClient.putBlob(putBlobClientInput);

    verifyEnsureBlobExistsResult(input, blob);

    return blob;
  }
}

/* exports */

export { BlobService };
export type { BlobServiceContract };
