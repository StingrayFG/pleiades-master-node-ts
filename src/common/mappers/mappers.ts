import { GenericMapperError } from '@/errors/application.errors';

/**/

export const parseByteCount = (value: string): bigint => {
  if (!/^\d+$/.test(value)) {
    throw new GenericMapperError('Invalid bytes value');
  }

  return BigInt(value);
};

export const withMapperError = <T>(message: string, mapping: () => T): T => {
  try {
    return mapping();
  } catch (err) {
    if (err instanceof GenericMapperError) {
      throw err;
    }

    throw new GenericMapperError(message, {
      cause: err
    });
  }
};
