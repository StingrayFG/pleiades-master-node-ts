import { ApplicationError } from './application.errors';

/**/

export const InternodeApplicationErrorCodes = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  DATA_LOSS: 'DATA_LOSS',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL: 'INTERNAL',
  UNAVAILABLE: 'UNAVAILABLE',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED'
} as const;

export type InternodeApplicationErrorCode =
  (typeof InternodeApplicationErrorCodes)[keyof typeof InternodeApplicationErrorCodes];

export abstract class InternodeApplicationError extends ApplicationError<InternodeApplicationErrorCode> {}

/**/

export class InternodeInvalidArgumentError extends InternodeApplicationError {
  constructor(message = 'Invalid argument', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.INVALID_ARGUMENT, message, options);
  }
}

export class InternodeNotFoundError extends InternodeApplicationError {
  constructor(message = 'Not found', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.NOT_FOUND, message, options);
  }
}

export class InternodeDataLossError extends InternodeApplicationError {
  constructor(message = 'Data loss', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.DATA_LOSS, message, options);
  }
}

export class InternodeFailedPreconditionError extends InternodeApplicationError {
  constructor(message = 'Failed precondition', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.FAILED_PRECONDITION, message, options);
  }
}

export class InternodeResourceExhaustedError extends InternodeApplicationError {
  constructor(message = 'Resource exhausted', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.RESOURCE_EXHAUSTED, message, options);
  }
}

export class InternodeAlreadyExistsError extends InternodeApplicationError {
  constructor(message = 'Already exists', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.ALREADY_EXISTS, message, options);
  }
}

export class InternodeInternalError extends InternodeApplicationError {
  constructor(message = 'Internal error', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.INTERNAL, message, options);
  }
}

export class InternodeUnavailableError extends InternodeApplicationError {
  constructor(message = 'Unavailable', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.UNAVAILABLE, message, options);
  }
}

export class InternodeDeadlineExceededError extends InternodeApplicationError {
  constructor(message = 'Deadline exceeded', options?: ErrorOptions) {
    super(InternodeApplicationErrorCodes.DEADLINE_EXCEEDED, message, options);
  }
}
