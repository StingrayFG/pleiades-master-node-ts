export abstract class ApplicationError<TCode extends string> extends Error {
  constructor(
    public readonly code: TCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/* error codes */

export const LocalApplicationErrorCodes = {
  // validation
  BAD_REQUEST: 'BAD_REQUEST',

  // authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // resource
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // state
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',

  // integrity
  DATA_LOSS: 'DATA_LOSS',

  // capacity
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',

  // availability
  UNAVAILABLE: 'UNAVAILABLE',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',

  // concurrency
  ABORTED: 'ABORTED',

  // internal
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',

  // implementation
  MAPPER_ERROR: 'MAPPER_ERROR'
} as const;

/* base error */

export type LocalApplicationErrorCode = (typeof LocalApplicationErrorCodes)[keyof typeof LocalApplicationErrorCodes];

export abstract class LocalApplicationError extends ApplicationError<LocalApplicationErrorCode> {}

/* validation errors */

export class GenericBadRequestError extends LocalApplicationError {
  constructor(message = 'Bad request', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.BAD_REQUEST, message, options);
  }
}

/* authorization errors */

export class GenericUnauthorizedError extends LocalApplicationError {
  constructor(message = 'Unauthorized', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.UNAUTHORIZED, message, options);
  }
}

export class GenericForbiddenError extends LocalApplicationError {
  constructor(message = 'Forbidden', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.FORBIDDEN, message, options);
  }
}

/* resource errors */

export class GenericNotFoundError extends LocalApplicationError {
  constructor(message = 'Not found', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.NOT_FOUND, message, options);
  }
}

export class GenericAlreadyExistsError extends LocalApplicationError {
  constructor(message = 'Already exists', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.ALREADY_EXISTS, message, options);
  }
}

export class GenericConflictError extends LocalApplicationError {
  constructor(message = 'Conflict', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.CONFLICT, message, options);
  }
}

/* state errors */

export class GenericFailedPreconditionError extends LocalApplicationError {
  constructor(message = 'Failed precondition', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.FAILED_PRECONDITION, message, options);
  }
}

/* integrity errors */

export class GenericDataLossError extends LocalApplicationError {
  constructor(message = 'Data loss', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.DATA_LOSS, message, options);
  }
}

/* capacity errors */

export class GenericResourceExhaustedError extends LocalApplicationError {
  constructor(message = 'Resource exhausted', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.RESOURCE_EXHAUSTED, message, options);
  }
}

/* availability errors */

export class GenericUnavailableError extends LocalApplicationError {
  constructor(message = 'Unavailable', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.UNAVAILABLE, message, options);
  }
}

export class GenericDeadlineExceededError extends LocalApplicationError {
  constructor(message = 'Deadline exceeded', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.DEADLINE_EXCEEDED, message, options);
  }
}

/* concurrency errors */

export class GenericAbortedError extends LocalApplicationError {
  constructor(message = 'Aborted', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.ABORTED, message, options);
  }
}

/* internal errors */

export class GenericInternalServerError extends LocalApplicationError {
  constructor(message = 'Internal server error', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.INTERNAL_SERVER_ERROR, message, options);
  }
}

/* implementation errors */

export class GenericMapperError extends LocalApplicationError {
  constructor(message = 'Mapper error', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.MAPPER_ERROR, message, options);
  }
}
