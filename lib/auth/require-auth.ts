import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { useAwsStack } from '@/lib/aws/stack';
import { requireAuth as requireAuthRds } from '@/lib/server-auth';
import type { AppRole } from '@/lib/roles';

export type AwsAuthContext = {
  userId: string;
  email: string;
  role: AppRole;
};

/**
 * Unified auth gate: Prisma/NextAuth when USE_AWS_STACK=true, else legacy AWS RDS.
 */
export async function requireAppAuth(
  allowedRoles?: AppRole[],
  request?: Request,
): Promise<{ ctx: AwsAuthContext } | { response: NextResponse }> {
  if (!useAwsStack()) {
    const legacy = await requireAuthRds(allowedRoles, request);
    if ('response' in legacy) return legacy;
    return {
      ctx: {
        userId: legacy.ctx.user.id,
        email: legacy.ctx.user.email ?? '',
        role: legacy.ctx.resolved.role,
      },
    };
  }

  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const role = (user.role ?? 'student') as AppRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    ctx: {
      userId: user.id,
      email: user.email ?? '',
      role,
    },
  };
}
