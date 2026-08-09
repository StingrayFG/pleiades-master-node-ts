import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import env from '@/env';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL
});

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
