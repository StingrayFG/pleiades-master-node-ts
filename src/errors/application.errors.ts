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
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**/

export class GenericBadRequestError extends ApplicationError {
  constructor(message = 'Bad request') {
    super(ApplicationErrorCodes.BAD_REQUEST, message);
  }
}

export class GenericUnauthorizedError extends ApplicationError {
  constructor(message = 'Unauthorized') {
    super(ApplicationErrorCodes.UNAUTHORIZED, message);
  }
}

export class GenericForbiddenError extends ApplicationError {
  constructor(message = 'Forbidden') {
    super(ApplicationErrorCodes.FORBIDDEN, message);
  }
}

export class GenericNotFoundError extends ApplicationError {
  constructor(message = 'Not found') {
    super(ApplicationErrorCodes.NOT_FOUND, message);
  }
}

export class GenericConflictError extends ApplicationError {
  constructor(message = 'Conflict') {
    super(ApplicationErrorCodes.CONFLICT, message);
  }
}

export class GenericInternalServerError extends ApplicationError {
  constructor(message = 'Internal server error') {
    super(ApplicationErrorCodes.INTERNAL_SERVER_ERROR, message);
  }
}
