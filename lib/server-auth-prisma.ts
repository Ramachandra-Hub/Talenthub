import { NextResponse } from 'next/server';
import type { AppRole, ResolvedUser } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { resolveAppUserById, roleAllows } from '@/lib/roles-prisma';
import { verifyPassword } from '@/lib/password';
import { getSafeSession } from '@/lib/auth/safe-session';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getDatabaseSetupErrors } from '@/lib/postgres-url';

export type PrismaAuthContext = {
  user: { id: string; email?: string };
  resolved: ResolvedUser;
};

import { useAwsStack } from '@/lib/aws/stack';

export function usePrismaAuth(): boolean {
  return useAwsStack();
}

async function resolveFromBearerToken(token: string): Promise<PrismaAuthContext | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const { decode } = await import('next-auth/jwt');
  const payload = await decode({
    token,
    secret,
    salt: '',
  });

  const sub = payload?.sub;
  if (!sub || typeof sub !== 'string') return null;

  const resolved = await resolveAppUserById(sub);
  if (!resolved) return null;

  return {
    user: { id: sub, email: resolved.email },
    resolved,
  };
}

export async function requirePrismaAuth(
  allowedRoles?: AppRole[],
  request?: Request,
): Promise<{ ctx: PrismaAuthContext } | { response: NextResponse }> {
  const configErrors = getDatabaseSetupErrors();
  if (configErrors.length) {
    return {
      response: NextResponse.json(
        { error: 'Server misconfigured', hint: configErrors.join(' ') },
        { status: 503 },
      ),
    };
  }

  const bearer = request?.headers.get('Authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;

  if (token) {
    try {
      const ctx = await resolveFromBearerToken(token);
      if (!ctx) {
        return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
      }
      if (!roleAllows(allowedRoles, ctx.resolved.role)) {
        return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
      }
      return { ctx };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { remediation } = classifyDatabaseError(message);
      return {
        response: NextResponse.json(
          { error: 'Database unavailable', hint: remediation[0] ?? message },
          { status: 503 },
        ),
      };
    }
  }

  const session = await getSafeSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  let resolved: ResolvedUser | null;
  try {
    resolved = await resolveAppUserById(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return {
      response: NextResponse.json(
        {
          error: 'Database unavailable',
          hint: remediation[0] ?? message,
        },
        { status: 503 },
      ),
    };
  }
  if (!resolved) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!roleAllows(allowedRoles, resolved.role)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    ctx: {
      user: { id: userId, email: resolved.email },
      resolved,
    },
  };
}

/** Admin/student sign-in for migration period (replaces AWS RDS signInWithPassword). */
export async function signInWithCredentials(
  email: string,
  password: string,
): Promise<{ userId: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { userId: user.id, email: user.email };
}

export function getPrismaDb() {
  return prisma;
}
