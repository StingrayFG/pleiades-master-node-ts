import { status } from '@grpc/grpc-js';

import { ApplicationError, type ApplicationErrorCode } from '@/errors/application.errors';

/**/

type GrpcStatusCode = (typeof status)[keyof typeof status];
type GrpcErrorCode = Exclude<GrpcStatusCode, typeof status.OK>;

const grpcStatusCodeByApplicationErrorCode = {
  BAD_REQUEST: status.INVALID_ARGUMENT,
  UNAUTHORIZED: status.UNAUTHENTICATED,
  FORBIDDEN: status.PERMISSION_DENIED,
  NOT_FOUND: status.NOT_FOUND,
  CONFLICT: status.ALREADY_EXISTS,
  INTERNAL_SERVER_ERROR: status.INTERNAL
} as const satisfies Record<ApplicationErrorCode, GrpcErrorCode>;

const mapApplicationErrorToGrpcStatusCode = (error: ApplicationError): GrpcErrorCode => {
  return grpcStatusCodeByApplicationErrorCode[error.code];
};

/**/

export { mapApplicationErrorToGrpcStatusCode };
