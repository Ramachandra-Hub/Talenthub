import { normalizeDatabaseEnvUrls } from '@/lib/postgres-url';
import { PrismaClient } from '@prisma/client';

normalizeDatabaseEnvUrls();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    transactionOptions: {
      maxWait: 5_000,
      timeout: 15_000,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
