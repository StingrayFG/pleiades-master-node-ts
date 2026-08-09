export const ApplicationErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
} as const;

export type ApplicationErrorCode = (typeof ApplicationErrorCodes)[keyof typeof ApplicationErrorCodes];

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
/**/

export class GenericBadRequestError extends ApplicationError {
  constructor(message = 'Bad request', options?: ErrorOptions) {
    super(ApplicationErrorCodes.BAD_REQUEST, message, options);
  }
}

export class GenericUnauthorizedError extends ApplicationError {
  constructor(message = 'Unauthorized', options?: ErrorOptions) {
    super(ApplicationErrorCodes.UNAUTHORIZED, message, options);
  }
}

export class GenericForbiddenError extends ApplicationError {
  constructor(message = 'Forbidden', options?: ErrorOptions) {
    super(ApplicationErrorCodes.FORBIDDEN, message, options);
  }
}

export class GenericNotFoundError extends ApplicationError {
  constructor(message = 'Not found', options?: ErrorOptions) {
    super(ApplicationErrorCodes.NOT_FOUND, message, options);
  }
}

export class GenericConflictError extends ApplicationError {
  constructor(message = 'Conflict', options?: ErrorOptions) {
    super(ApplicationErrorCodes.CONFLICT, message, options);
  }
}

export class GenericInternalServerError extends ApplicationError {
  constructor(message = 'Internal server error', options?: ErrorOptions) {
    super(ApplicationErrorCodes.INTERNAL_SERVER_ERROR, message, options);
  }
}
