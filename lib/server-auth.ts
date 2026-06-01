import { NextResponse } from 'next/server';
import type { AppRole, ResolvedUser } from '@/lib/roles';
import { requirePrismaAuth } from '@/lib/server-auth-prisma';
import { getDbService, type DbServiceClient } from '@/lib/db/get-db-service';

export type AuthContext = {
  db: DbServiceClient;
  user: { id: string; email?: string };
  resolved: ResolvedUser;
};

export async function requireAuth(
  allowedRoles?: AppRole[],
  request?: Request,
): Promise<{ ctx: AuthContext } | { response: NextResponse }> {
  const prismaAuth = await requirePrismaAuth(allowedRoles, request);
  if ('response' in prismaAuth) return prismaAuth;
  return {
    ctx: {
      db: getDbService(),
      user: prismaAuth.ctx.user,
      resolved: prismaAuth.ctx.resolved,
    },
  };
}

/** RDS service client (Prisma). */
export function getDbServiceClient(): DbServiceClient {
  return getDbService();
}

export { getDbService };
