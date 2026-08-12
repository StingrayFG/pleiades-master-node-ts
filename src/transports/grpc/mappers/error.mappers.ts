import { status } from '@grpc/grpc-js';

import {
  ApplicationError,
  GenericBadRequestError,
  GenericConflictError,
  GenericForbiddenError,
  GenericInternalServerError,
  GenericNotFoundError,
  GenericUnauthorizedError,
  type ApplicationErrorCode
} from '@/errors/application.errors';

/**/

type GrpcStatusCode = (typeof status)[keyof typeof status];
type GrpcErrorCode = Exclude<GrpcStatusCode, typeof status.OK>;

type ApplicationErrorFactory = (message: string) => ApplicationError;

/**/

const grpcStatusCodeByApplicationErrorCode = {
  BAD_REQUEST: status.INVALID_ARGUMENT,
  UNAUTHORIZED: status.UNAUTHENTICATED,
  FORBIDDEN: status.PERMISSION_DENIED,
  NOT_FOUND: status.NOT_FOUND,
  CONFLICT: status.ALREADY_EXISTS,
  INTERNAL_SERVER_ERROR: status.INTERNAL
} as const satisfies Record<ApplicationErrorCode, GrpcErrorCode>;

const applicationErrorFactoryByGrpcStatusCode = {
  [status.INVALID_ARGUMENT]: (message) => new GenericBadRequestError(message),
  [status.OUT_OF_RANGE]: (message) => new GenericBadRequestError(message),
  [status.UNAUTHENTICATED]: (message) => new GenericUnauthorizedError(message),
  [status.PERMISSION_DENIED]: (message) => new GenericForbiddenError(message),
  [status.NOT_FOUND]: (message) => new GenericNotFoundError(message),
  [status.ALREADY_EXISTS]: (message) => new GenericConflictError(message),
  [status.ABORTED]: (message) => new GenericConflictError(message),

  [status.CANCELLED]: () => new GenericInternalServerError('Internal server error'),
  [status.UNKNOWN]: () => new GenericInternalServerError('Internal server error'),
  [status.DEADLINE_EXCEEDED]: () => new GenericInternalServerError('Internal server error'),
  [status.RESOURCE_EXHAUSTED]: () => new GenericInternalServerError('Internal server error'),
  [status.FAILED_PRECONDITION]: () => new GenericInternalServerError('Internal server error'),
  [status.UNIMPLEMENTED]: () => new GenericInternalServerError('Internal server error'),
  [status.INTERNAL]: () => new GenericInternalServerError('Internal server error'),
  [status.UNAVAILABLE]: () => new GenericInternalServerError('Internal server error'),
  [status.DATA_LOSS]: () => new GenericInternalServerError('Internal server error')
} satisfies Partial<Record<GrpcErrorCode, ApplicationErrorFactory>>;

/**/

const mapApplicationErrorToGrpcStatusCode = (error: ApplicationError): GrpcErrorCode =>
  grpcStatusCodeByApplicationErrorCode[error.code];

const mapGrpcErrorToApplicationError = (error: unknown): ApplicationError | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }

  const code = error.code;

  if (typeof code !== 'number') {
    return undefined;
  }

  const factory = applicationErrorFactoryByGrpcStatusCode[code as keyof typeof applicationErrorFactoryByGrpcStatusCode];

  if (!factory) {
    return undefined;
  }

  const message =
    'details' in error && typeof error.details === 'string' && error.details.length > 0
      ? error.details
      : 'message' in error && typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : 'gRPC request failed';

  return factory(message);
};

/**/

export { mapApplicationErrorToGrpcStatusCode, mapGrpcErrorToApplicationError };
