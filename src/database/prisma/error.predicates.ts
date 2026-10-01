import { Prisma } from '@prisma/client';

/**/

export const isUniqueConstraintError = (
  err: unknown,
  fieldNames?: string | readonly string[]
): err is Prisma.PrismaClientKnownRequestError => {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  if (!fieldNames) {
    return true;
  }

  const target = err.meta?.target;

  if (!Array.isArray(target)) {
    return false;
  }

  const expectedFieldNames = typeof fieldNames === 'string' ? [fieldNames] : fieldNames;

  return (
    target.length === expectedFieldNames.length && expectedFieldNames.every((fieldName) => target.includes(fieldName))
  );
};
