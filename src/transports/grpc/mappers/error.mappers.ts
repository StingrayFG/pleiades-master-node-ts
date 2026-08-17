import { status } from '@grpc/grpc-js';

import { LocalApplicationError, type LocalApplicationErrorCode } from '@/errors/application.errors';
import {
  InternodeAlreadyExistsError,
  InternodeApplicationError,
  InternodeDataLossError,
  InternodeDeadlineExceededError,
  InternodeFailedPreconditionError,
  InternodeInternalError,
  InternodeInvalidArgumentError,
  InternodeNotFoundError,
  InternodeResourceExhaustedError,
  InternodeUnavailableError
} from '@/errors/internode.errors';

/**/

type GrpcStatusCode = (typeof status)[keyof typeof status];
type GrpcErrorCode = Exclude<GrpcStatusCode, typeof status.OK>;

type InternodeApplicationErrorFactory = (message: string, options?: ErrorOptions) => InternodeApplicationError;

/**/

const grpcStatusCodeByLocalApplicationErrorCode = {
  BAD_REQUEST: status.INVALID_ARGUMENT,
  UNAUTHORIZED: status.UNAUTHENTICATED,
  FORBIDDEN: status.PERMISSION_DENIED,
  NOT_FOUND: status.NOT_FOUND,
  CONFLICT: status.FAILED_PRECONDITION,
  INTERNAL_SERVER_ERROR: status.INTERNAL,
  MAPPING_ERROR: status.INTERNAL
} as const satisfies Record<LocalApplicationErrorCode, GrpcErrorCode>;

const internodeApplicationErrorFactoryByGrpcStatusCode = {
  [status.CANCELLED]: (message, options) => new InternodeInternalError(message, options),
  [status.UNKNOWN]: (message, options) => new InternodeInternalError(message, options),
  [status.INVALID_ARGUMENT]: (message, options) => new InternodeInvalidArgumentError(message, options),
  [status.DEADLINE_EXCEEDED]: (message, options) => new InternodeDeadlineExceededError(message, options),
  [status.NOT_FOUND]: (message, options) => new InternodeNotFoundError(message, options),
  [status.ALREADY_EXISTS]: (message, options) => new InternodeAlreadyExistsError(message, options),
  [status.PERMISSION_DENIED]: (message, options) => new InternodeInternalError(message, options),
  [status.RESOURCE_EXHAUSTED]: (message, options) => new InternodeResourceExhaustedError(message, options),
  [status.FAILED_PRECONDITION]: (message, options) => new InternodeFailedPreconditionError(message, options),
  [status.ABORTED]: (message, options) => new InternodeFailedPreconditionError(message, options),
  [status.OUT_OF_RANGE]: (message, options) => new InternodeInvalidArgumentError(message, options),
  [status.UNIMPLEMENTED]: (message, options) => new InternodeInternalError(message, options),
  [status.INTERNAL]: (message, options) => new InternodeInternalError(message, options),
  [status.UNAVAILABLE]: (message, options) => new InternodeUnavailableError(message, options),
  [status.DATA_LOSS]: (message, options) => new InternodeDataLossError(message, options),
  [status.UNAUTHENTICATED]: (message, options) => new InternodeInternalError(message, options)
} satisfies Record<GrpcErrorCode, InternodeApplicationErrorFactory>;

/**/

const mapLocalApplicationErrorToGrpcStatusCode = (error: LocalApplicationError): GrpcErrorCode =>
  grpcStatusCodeByLocalApplicationErrorCode[error.code];

const isGrpcErrorCode = (value: unknown): value is GrpcErrorCode => {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= status.CANCELLED && value <= status.UNAUTHENTICATED
  );
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

  return internodeApplicationErrorFactoryByGrpcStatusCode[code](message, {
    cause: error
  });
};

/**/

export { mapLocalApplicationErrorToGrpcStatusCode, mapGrpcErrorToInternodeApplicationError };
