import { Metadata, status, type ServerErrorResponse } from '@grpc/grpc-js';
import { ZodError } from 'zod';

import { LocalApplicationError } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';
import { mapLocalApplicationErrorToGrpcStatusCode } from '@/transports/grpc/mappers/error.mappers';

/**/

type GrpcStatusCode = (typeof status)[keyof typeof status];
type GrpcErrorCode = Exclude<GrpcStatusCode, typeof status.OK>;

type NormalizedGrpcError = {
  code: GrpcErrorCode;
  details: string;
  metadata?: Metadata;
};

type ClassifiedError =
  | { kind: 'application-local'; error: LocalApplicationError }
  | { kind: 'application-internode'; error: InternodeApplicationError }
  | { kind: 'validation'; error: ZodError }
  | { kind: 'grpc'; error: NormalizedGrpcError }
  | { kind: 'internal'; error: unknown };

type ToGrpcServerErrorOptions = {
  onInternalError?: (error: unknown) => void;
};

const INVALID_REQUEST_DETAILS = 'Invalid request';
const INTERNAL_ERROR_DETAILS = 'Internal server error';
const GRPC_ERROR_DETAILS = 'gRPC error';

const ALLOWED_ERROR_METADATA_KEYS = new Set<string>();

/**/

const createGrpcServerError = (code: GrpcErrorCode, details: string, metadata?: Metadata): ServerErrorResponse => {
  const error = new Error(details) as ServerErrorResponse;

  error.code = code;
  error.details = details;

  if (metadata) {
    error.metadata = metadata;
  }

  return error;
};

/**/

const isGrpcErrorCode = (value: unknown): value is GrpcErrorCode => {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= status.CANCELLED && value <= status.UNAUTHENTICATED
  );
};

const normalizeErrorMetadata = (value: unknown): Metadata | undefined => {
  if (!(value instanceof Metadata)) {
    return undefined;
  }

  const metadata = new Metadata();
  let hasValues = false;

  for (const key of ALLOWED_ERROR_METADATA_KEYS) {
    for (const metadataValue of value.get(key)) {
      metadata.add(key, metadataValue);
      hasValues = true;
    }
  }

  return hasValues ? metadata : undefined;
};

const normalizeGrpcError = (error: unknown): NormalizedGrpcError | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = 'code' in error ? error.code : undefined;

  if (!isGrpcErrorCode(code)) {
    return undefined;
  }

  const details =
    'details' in error && typeof error.details === 'string' && error.details.length > 0
      ? error.details
      : 'message' in error && typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : GRPC_ERROR_DETAILS;

  const metadata = 'metadata' in error ? normalizeErrorMetadata(error.metadata) : undefined;

  return {
    code,
    details,
    metadata
  };
};

const classifyError = (err: unknown): ClassifiedError => {
  if (err instanceof LocalApplicationError) {
    return {
      kind: 'application-local',
      error: err
    };
  }

  if (err instanceof InternodeApplicationError) {
    return {
      kind: 'application-internode',
      error: err
    };
  }

  if (err instanceof ZodError) {
    return {
      kind: 'validation',
      error: err
    };
  }

  const normalizedGrpcError = normalizeGrpcError(err);

  if (normalizedGrpcError) {
    return {
      kind: 'grpc',
      error: normalizedGrpcError
    };
  }

  return {
    kind: 'internal',
    error: err
  };
};

/**/

const toGrpcServerError = (err: unknown, options: ToGrpcServerErrorOptions = {}): ServerErrorResponse => {
  const classifiedError = classifyError(err);

  switch (classifiedError.kind) {
    case 'application-local': {
      const applicationError = classifiedError.error;
      const code = mapLocalApplicationErrorToGrpcStatusCode(applicationError);

      return createGrpcServerError(code, applicationError.message);
    }

    case 'application-internode': {
      options.onInternalError?.(err);

      return createGrpcServerError(status.INTERNAL, INTERNAL_ERROR_DETAILS);
    }

    case 'validation':
      return createGrpcServerError(status.INVALID_ARGUMENT, INVALID_REQUEST_DETAILS);

    case 'grpc': {
      const { code, details, metadata } = classifiedError.error;

      return createGrpcServerError(code, details, metadata);
    }

    case 'internal':
      options.onInternalError?.(err);

      return createGrpcServerError(status.INTERNAL, INTERNAL_ERROR_DETAILS);
  }
};

/**/

export { toGrpcServerError };
export type { ToGrpcServerErrorOptions };
