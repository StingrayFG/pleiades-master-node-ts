import { Prisma } from '@prisma/client';

const isUniqueConstraintError = (err: unknown): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export { isUniqueConstraintError };
