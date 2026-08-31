import { parseByteCount, withMapperError } from '@/common/mappers/mappers';
import {
  DeleteBlobRequest,
  GetBlobRequest,
  HeadBlobRequest,
  PutBlobRequest,
  VerifyBlobRequest,
  type GetBlobResponse,
  type HeadBlobResponse,
  type PutBlobResponse,
  type VerifyBlobResponse
} from '@/gen/proto/blob/v1/blob';

import type {
  DeleteBlobClientInput,
  GetBlobClientInput,
  HeadBlobClientInput,
  PutBlobClientInput,
  VerifyBlobClientInput
} from './blob.application';
import {
  blobMetadataSchema,
  blobMetadataWithBytesSchema,
  type BlobMetadata,
  type BlobMetadataWithBytes
} from './blob.domain';

/* grpc -> domain mappers */

export const mapGrpcHeadBlobResponseToDomainBlobMetadata = (response: HeadBlobResponse): BlobMetadata => {
  return withMapperError('Failed to map gRPC head blob response to domain blob metadata', () =>
    blobMetadataSchema.parse({
      blobId: response.blob_id,
      sizeBytes: parseByteCount(response.size_bytes),
      checksumAlgorithm: response.checksum_algorithm,
      checksumValue: response.checksum_value
    })
  );
};

export const mapGrpcGetBlobResponseToDomainBlobMetadataWithBytes = (
  response: GetBlobResponse
): BlobMetadataWithBytes => {
  return withMapperError('Failed to map gRPC get blob response to domain blob metadata with bytes', () =>
    blobMetadataWithBytesSchema.parse({
      blobId: response.blob_id,
      sizeBytes: parseByteCount(response.size_bytes),
      checksumAlgorithm: response.checksum_algorithm,
      checksumValue: response.checksum_value,
      bytes: response.bytes
    })
  );
};

export const mapGrpcVerifyBlobResponseToDomainBlobMetadata = (response: VerifyBlobResponse): BlobMetadata => {
  return withMapperError('Failed to map gRPC verify blob response to domain blob metadata', () =>
    blobMetadataSchema.parse({
      blobId: response.blob_id,
      sizeBytes: parseByteCount(response.size_bytes),
      checksumAlgorithm: response.checksum_algorithm,
      checksumValue: response.checksum_value
    })
  );
};

export const mapGrpcPutBlobResponseToDomainBlobMetadata = (response: PutBlobResponse): BlobMetadata => {
  return withMapperError('Failed to map gRPC put blob response to domain blob metadata', () =>
    blobMetadataSchema.parse({
      blobId: response.blob_id,
      sizeBytes: parseByteCount(response.size_bytes),
      checksumAlgorithm: response.checksum_algorithm,
      checksumValue: response.checksum_value
    })
  );
};

/* client -> grpc mappers */

export const mapHeadBlobClientInputToGrpcHeadBlobRequest = (input: HeadBlobClientInput): HeadBlobRequest => {
  return withMapperError('Failed to map head blob gRPC client input to gRPC request', () =>
    HeadBlobRequest.create({
      blob_id: input.blobId
    })
  );
};

export const mapGetBlobClientInputToGrpcGetBlobRequest = (input: GetBlobClientInput): GetBlobRequest => {
  return withMapperError('Failed to map get blob gRPC client input to gRPC request', () =>
    GetBlobRequest.create({
      blob_id: input.blobId
    })
  );
};

export const mapVerifyBlobClientInputToGrpcVerifyBlobRequest = (input: VerifyBlobClientInput): VerifyBlobRequest => {
  return withMapperError('Failed to map verify blob gRPC client input to gRPC request', () =>
    VerifyBlobRequest.create({
      blob_id: input.blobId
    })
  );
};

export const mapPutBlobClientInputToGrpcPutBlobRequest = (input: PutBlobClientInput): PutBlobRequest => {
  return withMapperError('Failed to map put blob gRPC client input to gRPC request', () =>
    PutBlobRequest.create({
      blob_id: input.blob.blobId,
      size_bytes: input.blob.sizeBytes.toString(),
      checksum_algorithm: input.blob.checksumAlgorithm,
      checksum_value: input.blob.checksumValue,
      bytes: input.blob.bytes
    })
  );
};

export const mapDeleteBlobClientInputToGrpcDeleteBlobRequest = (input: DeleteBlobClientInput): DeleteBlobRequest => {
  return withMapperError('Failed to map delete blob client input to gRPC request', () =>
    DeleteBlobRequest.create({
      blob_id: input.blobId
    })
  );
};
