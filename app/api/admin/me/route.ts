import { NextRequest, NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { resolveAppUserById } from '@/lib/roles-prisma';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';
import { getDatabaseSetupErrors } from '@/lib/postgres-url';

export const dynamic = 'force-dynamic';

function configErrorResponse(errors: string[]) {
  return NextResponse.json(
    {
      isAdmin: false,
      authenticated: false,
      error: 'Server misconfigured',
      hint: errors.join(' '),
    },
    { status: 503 },
  );
}

export async function GET(_request: NextRequest) {
  try {
    const dbErrors = getDatabaseSetupErrors();
    if (dbErrors.length) {
      return configErrorResponse(dbErrors);
    }

    if (!process.env.AUTH_SECRET?.trim()) {
      return NextResponse.json(
        {
          isAdmin: false,
          authenticated: false,
          error: 'AUTH_SECRET is not set',
          hint: 'Add AUTH_SECRET in Vercel → Settings → Environment Variables (Production), then redeploy.',
        },
        { status: 503 },
      );
    }

    const session = await getSafeSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ isAdmin: false, authenticated: false });
    }

    let resolved;
    try {
      resolved = await resolveAppUserById(user.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { code, remediation } = classifyDatabaseError(message);
      return NextResponse.json(
        {
          isAdmin: false,
          authenticated: true,
          email: user.email ?? null,
          error: 'Database error while checking admin role',
          db_error: code,
          hint: remediation[0] ?? message,
          remediation,
        },
        { status: 503 },
      );
    }

    const isAdmin = resolved?.role === 'admin';

    return NextResponse.json({
      isAdmin,
      authenticated: true,
      role: isAdmin ? 'admin' : resolved?.role ?? null,
      email: user.email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/admin/me]', message);
    return NextResponse.json(
      {
        isAdmin: false,
        authenticated: false,
        error: 'Admin session check failed',
        hint: 'Sign in again at /auth/login/admin. If this persists, set AUTH_SECRET and DATABASE_URL in Vercel and redeploy.',
      },
      { status: 503 },
    );
  }
}
