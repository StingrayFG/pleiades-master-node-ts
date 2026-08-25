import { GenericMappingError } from '@/errors/application.errors';

/**/

export const parseByteCount = (value: string): bigint => {
  if (!/^\d+$/.test(value)) {
    throw new GenericMappingError('Invalid bytes value');
  }

  return BigInt(value);
};
