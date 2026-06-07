import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isS3Configured } from '@/lib/aws/s3';
import { getDatabaseSetupErrors } from '@/lib/postgres-url';
import { isStrictProduction } from '@/lib/production';
import { guardPublicApi } from '@/lib/public-api-guard';

export const dynamic = 'force-dynamic';

/** Minimal public health — no host/user/schema sync (use internal ops tools for detail). */
export async function GET(request: Request) {
  const denied = guardPublicApi(request, 'health');
  if (denied) return denied;
  const checks: Record<string, string> = {
    app: 'ok',
  };

  const dbConfigErrors = getDatabaseSetupErrors();
  if (dbConfigErrors.length) {
    return NextResponse.json(
      { status: 'unhealthy', checks: { ...checks, database: 'misconfigured' } },
      { status: 503 },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', checks: { ...checks, database: 'unreachable' } },
      { status: 503 },
    );
  }

  checks.s3 = isS3Configured() ? 'ok' : 'not_configured';

  if (!isStrictProduction()) {
    checks.auth_mode = 'prisma_jwt';
    checks.runtime = process.env.VERCEL === '1' ? 'vercel' : 'node';
  }

  return NextResponse.json({ status: 'healthy', checks });
}
