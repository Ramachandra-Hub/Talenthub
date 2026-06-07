/**
 * RDS database service client (Prisma-backed PostgREST-style API).
 * AWS RDS only — AWS RDS only.
 */
import { createPrismaServiceClient } from '@/lib/db/prisma-service-client';

export type PostgrestError = { message: string; code?: string };

export type DbServiceClient = ReturnType<typeof createPrismaServiceClient>;

export function getDbService(): DbServiceClient {
  return createPrismaServiceClient();
}
