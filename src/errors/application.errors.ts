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
  BAD_REQUEST: 'BAD_REQUEST',

  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',

  MAPPING_ERROR: 'MAPPING_ERROR'
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

export class GenericConflictError extends LocalApplicationError {
  constructor(message = 'Conflict', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.CONFLICT, message, options);
  }
}

/* internal errors */

export class GenericInternalServerError extends LocalApplicationError {
  constructor(message = 'Internal server error', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.INTERNAL_SERVER_ERROR, message, options);
  }
}

/* implementation errors */

export class GenericMappingError extends LocalApplicationError {
  constructor(message = 'Mapping error', options?: ErrorOptions) {
    super(LocalApplicationErrorCodes.MAPPING_ERROR, message, options);
  }
}
