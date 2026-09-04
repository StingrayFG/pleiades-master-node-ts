import type { ErrorCauseEntry } from '@/errors/error-causes';

/* types */

type SerializedError = {
  type: string;
  message: string;
  stack: string;
  [key: string]: unknown;
};

/* helpers */

const isErrorCauseEntry = (value: object): value is ErrorCauseEntry => {
  return 'source' in value && typeof value.source === 'string' && 'error' in value;
};

const serializeError = (error: Error, seen: WeakSet<object>): SerializedError => {
  const serializedError: SerializedError = {
    type: error.name,
    message: error.message,
    stack: error.stack ?? `${error.name}: ${error.message}`
  };

  for (const [key, value] of Object.entries(error)) {
    if (key === 'cause' || key === 'errors') {
      continue;
    }

    serializedError[key] = serializeErrorValue(value, seen);
  }

  if (error.cause !== undefined) {
    serializedError.cause = serializeErrorValue(error.cause, seen);
  }

  if (error instanceof AggregateError) {
    serializedError.errors = error.errors.map((value) => serializeErrorValue(value, seen));
  }

  return serializedError;
};

const serializeErrorValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (value instanceof Error) {
    return serializeError(value, seen);
  }

  if (isErrorCauseEntry(value)) {
    return {
      source: value.source,
      error: serializeErrorValue(value.error, seen)
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeErrorValue(entry, seen));
  }

  return value;
};

/* serializer */

const serializeErrorForLog = (error: Error): SerializedError => {
  if (!(error instanceof Error)) {
    return {
      type: 'UnknownError',
      message: 'Unknown error',
      stack: '',
      value: error
    };
  }

  const seen = new WeakSet<object>();

  seen.add(error);

  return serializeError(error, seen);
};

/* exports */

export { serializeErrorForLog };
