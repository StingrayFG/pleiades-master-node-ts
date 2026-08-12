import { GenericMappingError } from '@/errors/application.errors';

/**/

export const wrapMapping = <T>(message: string, mapping: () => T): T => {
  try {
    return mapping();
  } catch (err) {
    if (err instanceof GenericMappingError) {
      throw err;
    }

    throw new GenericMappingError(message, {
      cause: err
    });
  }
};
