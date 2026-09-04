import { Metadata, status } from '@grpc/grpc-js';

import { LocalApplicationError, type LocalApplicationErrorCode } from '@/errors/application.errors';
import {
  InternodeApplicationError,
  InternodeAbortedError,
  InternodeAlreadyExistsError,
  InternodeDataLossError,
  InternodeDeadlineExceededError,
  InternodeFailedPreconditionError,
  InternodeInternalError,
  InternodeInvalidArgumentError,
  InternodeNotFoundError,
  InternodeResourceExhaustedError,
  InternodeUnavailableError,
  InternodeErrorDetails
} from '@/errors/internode.errors';
import { BlobErrorDetails, BlobState } from '@/gen/proto/blob/v1/blob';

import type { DataNodeBlobState } from '@/modules/blobs/blob.domain';

/* types and constants */

type GrpcStatusCode = (typeof status)[keyof typeof status];
type GrpcErrorCode = Exclude<GrpcStatusCode, typeof status.OK>;

type KnownBlobState = Exclude<BlobState, BlobState.UNRECOGNIZED>;

type InternodeApplicationErrorFactory = (
  ...args: [message: string, details?: InternodeErrorDetails, options?: ErrorOptions]
) => InternodeApplicationError;

const BLOB_ERROR_DETAILS_METADATA_KEY = 'blob-error-details-bin';

/* maps */

const grpcStatusCodeByLocalApplicationErrorCode = {
  BAD_REQUEST: status.INVALID_ARGUMENT,
  UNAUTHORIZED: status.UNAUTHENTICATED,
  FORBIDDEN: status.PERMISSION_DENIED,
  NOT_FOUND: status.NOT_FOUND,
  ALREADY_EXISTS: status.ALREADY_EXISTS,
  CONFLICT: status.FAILED_PRECONDITION,
  FAILED_PRECONDITION: status.FAILED_PRECONDITION,
  DATA_LOSS: status.DATA_LOSS,
  RESOURCE_EXHAUSTED: status.RESOURCE_EXHAUSTED,
  UNAVAILABLE: status.UNAVAILABLE,
  DEADLINE_EXCEEDED: status.DEADLINE_EXCEEDED,
  ABORTED: status.ABORTED,
  INTERNAL_SERVER_ERROR: status.INTERNAL,
  MAPPER_ERROR: status.INTERNAL
} as const satisfies Record<LocalApplicationErrorCode, GrpcErrorCode>;

const internodeApplicationErrorFactoryByGrpcStatusCode = {
  [status.CANCELLED]: (message, _details, options) => new InternodeInternalError(message, options),
  [status.UNKNOWN]: (message, _details, options) => new InternodeInternalError(message, options),
  [status.INVALID_ARGUMENT]: (...args) => new InternodeInvalidArgumentError(...args),
  [status.DEADLINE_EXCEEDED]: (message, _details, options) => new InternodeDeadlineExceededError(message, options),
  [status.NOT_FOUND]: (...args) => new InternodeNotFoundError(...args),
  [status.ALREADY_EXISTS]: (...args) => new InternodeAlreadyExistsError(...args),
  [status.PERMISSION_DENIED]: (message, _details, options) => new InternodeInternalError(message, options),
  [status.RESOURCE_EXHAUSTED]: (...args) => new InternodeResourceExhaustedError(...args),
  [status.FAILED_PRECONDITION]: (...args) => new InternodeFailedPreconditionError(...args),
  [status.ABORTED]: (message, _details, options) => new InternodeAbortedError(message, options),
  [status.OUT_OF_RANGE]: (...args) => new InternodeInvalidArgumentError(...args),
  [status.UNIMPLEMENTED]: (message, _details, options) => new InternodeInternalError(message, options),
  [status.INTERNAL]: (message, _details, options) => new InternodeInternalError(message, options),
  [status.UNAVAILABLE]: (message, _details, options) => new InternodeUnavailableError(message, options),
  [status.DATA_LOSS]: (...args) => new InternodeDataLossError(...args),
  [status.UNAUTHENTICATED]: (message, _details, options) => new InternodeInternalError(message, options)
} satisfies Record<GrpcErrorCode, InternodeApplicationErrorFactory>;

const dataNodeBlobStateByProtoState = {
  [BlobState.BLOB_STATE_PENDING]: 'pending',
  [BlobState.BLOB_STATE_TEMP]: 'temp',
  [BlobState.BLOB_STATE_COMMITTED]: 'committed',
  [BlobState.BLOB_STATE_DELETING]: 'deleting',
  [BlobState.BLOB_STATE_CORRUPT]: 'corrupt',
  [BlobState.BLOB_STATE_MISSING]: 'missing'
} as const satisfies Record<KnownBlobState, DataNodeBlobState>;

/* mappers */

const isGrpcErrorCode = (value: unknown): value is GrpcErrorCode => {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= status.CANCELLED && value <= status.UNAUTHENTICATED
  );
};

const mapLocalApplicationErrorToGrpcStatusCode = (error: LocalApplicationError): GrpcErrorCode => {
  return grpcStatusCodeByLocalApplicationErrorCode[error.code];
};

const mapGrpcErrorToInternodeApplicationError = (error: unknown): InternodeApplicationError | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = 'code' in error ? error.code : undefined;

  if (!isGrpcErrorCode(code)) {
    return undefined;
  }

  const message =
    'details' in error && typeof error.details === 'string' && error.details.length > 0
      ? error.details
      : 'message' in error && typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : 'gRPC request failed';

  const errorDetails = extractInternodeErrorDetails(error);

  return internodeApplicationErrorFactoryByGrpcStatusCode[code](message, errorDetails, {
    cause: error
  });
};

const extractInternodeErrorDetails = (error: unknown): InternodeErrorDetails | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const metadata = 'metadata' in error && error.metadata instanceof Metadata ? error.metadata : undefined;

  let details;

  if (metadata?.get(BLOB_ERROR_DETAILS_METADATA_KEY).length) {
    details = decodeBlobErrorDetailsFromMetadata(metadata);

    if (!details || !details.blob_id || details.state === BlobState.UNRECOGNIZED) {
      return undefined;
    }

    const blobState = dataNodeBlobStateByProtoState[details.state];

    if (!blobState) {
      return undefined;
    }

    return {
      blobId: details.blob_id,
      blobState
    };
  }
};

const decodeBlobErrorDetailsFromMetadata = (metadata: Metadata): BlobErrorDetails | undefined => {
  const value = metadata.get(BLOB_ERROR_DETAILS_METADATA_KEY)[0];

  if (!Buffer.isBuffer(value)) {
    return undefined;
  }

  try {
    return BlobErrorDetails.decode(value);
  } catch {
    return undefined;
  }
};

/* exports */

export { isGrpcErrorCode, mapLocalApplicationErrorToGrpcStatusCode, mapGrpcErrorToInternodeApplicationError };
