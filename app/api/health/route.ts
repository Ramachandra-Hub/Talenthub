import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isS3Configured } from '@/lib/aws/s3';
import { autoEnsureRdsSchema, isAutoRdsSchemaEnabled } from '@/lib/db/auto-ensure-rds';
import {
  classifyDatabaseError,
  getDatabaseUrlMismatchWarnings,
  parsePostgresUrl,
} from '@/lib/db/rds-connectivity';
import { getDatabaseSetupErrors } from '@/lib/postgres-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string | string[]> = {
    app: 'ok',
    auth_mode: 'prisma_jwt',
  };

  const runtime = process.env.VERCEL === '1' || process.env.VERCEL_ENV ? 'vercel' : 'node';
  checks.runtime = runtime;

  const dbConfigErrors = getDatabaseSetupErrors();
  if (dbConfigErrors.length) {
    checks.database = 'misconfigured';
    checks.database_hint = dbConfigErrors.join(' ');
    return NextResponse.json(
      { status: 'unhealthy', checks, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  const mismatch = getDatabaseUrlMismatchWarnings();
  if (mismatch.length) {
    checks.database_url_warnings = mismatch;
  }

  const parsed = parsePostgresUrl(process.env.DATABASE_URL ?? '');
  if (parsed) {
    checks.database_host = parsed.host;
    checks.database_name = parsed.database;
    checks.database_user = parsed.user;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { code, remediation } = classifyDatabaseError(message);
    checks.database = code;
    checks.database_error = message;
    checks.remediation = remediation;
    return NextResponse.json(
      { status: 'unhealthy', checks, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  if (isAutoRdsSchemaEnabled()) {
    const sync = await autoEnsureRdsSchema();
    checks.schema_auto_sync = sync.ok ? 'ok' : 'failed';
    if (!sync.ok && !sync.skipped) {
      checks.schema_auto_sync_detail = sync.detail ?? sync.message;
      if (sync.detail) {
        const { remediation } = classifyDatabaseError(sync.detail);
        checks.schema_remediation = remediation;
      }
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
    checks.users_table = 'ok';
  } catch {
    checks.users_table = 'missing';
    checks.remediation = [
      ...(Array.isArray(checks.remediation) ? checks.remediation : []),
      'Tables not ready: POST /api/setup/rds once, or run pnpm init:rds from your PC.',
    ];
  }

  checks.s3 = isS3Configured() ? 'ok' : 'not_configured';

  const healthy = checks.database === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
