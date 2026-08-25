import { Prisma } from '@prisma/client';

import {
  GenericConflictError,
  GenericInternalServerError,
  GenericNotFoundError,
  type LocalApplicationError
} from '@/errors/application.errors';

/**/

type LocalApplicationErrorFactory = (message: string, cause: unknown) => LocalApplicationError;

type PrismaErrorDescriptor = {
  createError: LocalApplicationErrorFactory;
  message: string;
};

const defaultPrismaErrorDescriptors = {
  uniqueConstraintViolation: {
    createError: (message, cause) => new GenericConflictError(message, { cause }),
    message: 'Unique constraint violation'
  },

  requiredRecordNotFound: {
    createError: (message, cause) => new GenericNotFoundError(message, { cause }),
    message: 'Required record not found'
  },

  validationError: {
    createError: (message, cause) => new GenericInternalServerError(message, { cause }),
    message: 'Prisma validation error'
  },

  initializationError: {
    createError: (message, cause) => new GenericInternalServerError(message, { cause }),
    message: 'Initialization error'
  },

  rustPanicError: {
    createError: (message, cause) => new GenericInternalServerError(message, { cause }),
    message: 'Rust panic error'
  },

  unknownRequestError: {
    createError: (message, cause) => new GenericInternalServerError(message, { cause }),
    message: 'Unknown request error'
  },

  knownRequestFallbackError: {
    createError: (message, cause) => new GenericInternalServerError(message, { cause }),
    message: 'Unexpected Prisma error'
  }
} satisfies Record<string, PrismaErrorDescriptor>;

type PrismaErrorDescriptorName = keyof typeof defaultPrismaErrorDescriptors;

/**/

type PrismaErrorOverride = {
  createError?: LocalApplicationErrorFactory;
  message?: string;
};

type PrismaErrorMapperOverrides = {
  errors?: Partial<Record<PrismaErrorDescriptorName, PrismaErrorOverride>>;
};

/**/

const descriptorNameByPrismaErrorCode = new Map<string, PrismaErrorDescriptorName>([
  ['P2002', 'uniqueConstraintViolation'],
  ['P2025', 'requiredRecordNotFound']
]);

const descriptorNameByPrismaErrorConstructor = new Map<unknown, PrismaErrorDescriptorName>([
  [Prisma.PrismaClientValidationError, 'validationError'],
  [Prisma.PrismaClientInitializationError, 'initializationError'],
  [Prisma.PrismaClientRustPanicError, 'rustPanicError'],
  [Prisma.PrismaClientUnknownRequestError, 'unknownRequestError']
]);

/**/

const createPrismaLocalApplicationError = (
  err: unknown,
  name: PrismaErrorDescriptorName,
  override?: PrismaErrorOverride
): LocalApplicationError => {
  const descriptor = defaultPrismaErrorDescriptors[name];

  const createError = override?.createError ?? descriptor.createError;

  const message = override?.message ?? descriptor.message;

  return createError(message, err);
};

const mapPrismaError = (
  err: unknown,
  { errors = {} }: PrismaErrorMapperOverrides = {}
): LocalApplicationError | undefined => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const name = descriptorNameByPrismaErrorCode.get(err.code) ?? 'knownRequestFallbackError';

    return createPrismaLocalApplicationError(err, name, errors[name]);
  }

  if (!err || typeof err !== 'object') {
    return undefined;
  }

  const constructor = (err as { constructor?: unknown }).constructor;

  const name = descriptorNameByPrismaErrorConstructor.get(constructor);

  if (!name) {
    return undefined;
  }

  return createPrismaLocalApplicationError(err, name, errors[name]);
};

export { mapPrismaError };

export type { PrismaErrorMapperOverrides, PrismaErrorOverride };
