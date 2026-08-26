import { ApplicationError } from './application.errors';

import type { InternodeBlobErrorDetails } from '@/modules/blobs/blob.internode';

/* error codes */

export const InternodeApplicationErrorCodes = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',

  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  FAILED_PRECONDITION: 'FAILED_PRECONDITION',

  DATA_LOSS: 'DATA_LOSS',

  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',

  UNAVAILABLE: 'UNAVAILABLE',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',

  INTERNAL: 'INTERNAL'
} as const;

export type InternodeApplicationErrorCode =
  (typeof InternodeApplicationErrorCodes)[keyof typeof InternodeApplicationErrorCodes];

export abstract class InternodeApplicationError<
  TDetails = unknown
> extends ApplicationError<InternodeApplicationErrorCode> {
  constructor(
    code: InternodeApplicationErrorCode,
    message: string,
    public readonly details?: TDetails,
    options?: ErrorOptions
  ) {
    super(code, message, options);
  }
}

export type InternodeErrorDetails = InternodeBlobErrorDetails;

/* validation errors */

export class InternodeInvalidArgumentError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Invalid argument', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.INVALID_ARGUMENT, message, details, options);
  }
}

/* resource errors */

export class InternodeNotFoundError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Not found', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.NOT_FOUND, message, details, options);
  }
}

export class InternodeAlreadyExistsError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Already exists', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.ALREADY_EXISTS, message, details, options);
  }
}

/* state errors */

export class InternodeFailedPreconditionError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Failed precondition', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.FAILED_PRECONDITION, message, details, options);
  }
}

/* integrity errors */

export class InternodeDataLossError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Data loss', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.DATA_LOSS, message, details, options);
  }
}

/* capacity errors */

export class InternodeResourceExhaustedError extends InternodeApplicationError<InternodeErrorDetails> {
  constructor(message = 'Resource exhausted', details?: InternodeErrorDetails, options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.RESOURCE_EXHAUSTED, message, details, options);
  }
}

/* availability errors */

export class InternodeUnavailableError extends InternodeApplicationError {
  constructor(message = 'Unavailable', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.UNAVAILABLE, message, undefined, options);
  }
}

export class InternodeDeadlineExceededError extends InternodeApplicationError {
  constructor(message = 'Deadline exceeded', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.DEADLINE_EXCEEDED, message, undefined, options);
  }
}

/* internal errors */

export class InternodeInternalError extends InternodeApplicationError {
  constructor(message = 'Internal error', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.INTERNAL, message, undefined, options);
  }
}
