import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

function envForPrismaPush(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const direct = (process.env.DIRECT_URL || process.env.DATABASE_URL || '').trim();
  if (!direct) return env;

  const withoutPoolLimit = direct
    .replace(/[?&]connection_limit=\d+/gi, '')
    .replace(/\?&/, '?')
    .replace(/\?$/, '');

  env.DATABASE_URL = withoutPoolLimit;
  env.DIRECT_URL = withoutPoolLimit;
  return env;
}

function runPrismaDbPush(): { ok: true } | { ok: false; detail: string } {
  const root = process.cwd();
  const isWin = process.platform === 'win32';
  const localBin = path.join(root, 'node_modules', '.bin', isWin ? 'prisma.cmd' : 'prisma');
  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  const args = [
    'db',
    'push',
    '--accept-data-loss',
    '--skip-generate',
    '--schema',
    schemaPath,
  ];
  const pushEnv = envForPrismaPush();

  const run = (command: string, commandArgs: string[]) => {
    const result = spawnSync(command, commandArgs, {
      cwd: root,
      env: pushEnv,
      encoding: 'utf8',
      shell: isWin,
      timeout: 110_000,
    });
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    if (result.error) {
      return { ok: false as const, detail: result.error.message };
    }
    if (result.status !== 0) {
      return { ok: false as const, detail: detail || `prisma db push exited ${result.status}` };
    }
    return { ok: true as const };
  };

  if (fs.existsSync(localBin)) {
    return run(localBin, args);
  }
  return run('npx', ['prisma', ...args]);
}

/** True when core tables exist and accept a query. */
export async function isRdsSchemaReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync RDS schema from prisma/schema.prisma (creates tables + missing columns).
 * Safe to re-run — Prisma db push is additive for new columns/tables.
 */
export async function ensureRdsSchema(): Promise<{ ok: boolean; message: string; detail?: string }> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, message: 'DATABASE_URL is not configured' };
  }

  const pushed = runPrismaDbPush();
  if (!pushed.ok) {
    return {
      ok: false,
      message: 'Schema sync failed',
      detail: pushed.detail,
    };
  }

  if (!(await isRdsSchemaReady())) {
    return {
      ok: false,
      message: 'Schema sync incomplete',
      detail:
        'The users table was not created. Run `pnpm init:rds` on your PC (same DATABASE_URL as Vercel) or retry POST /api/setup/rds.',
    };
  }

  return {
    ok: true,
    message: 'Database schema is up to date (tables and columns from prisma/schema.prisma).',
  };
}

/** Call before any prisma.user.* writes when tables may not exist yet. */
export async function ensureRdsSchemaReadyForWrites(): Promise<void> {
  if (await isRdsSchemaReady()) return;

  const result = await ensureRdsSchema();
  if (!result.ok || !(await isRdsSchemaReady())) {
    throw new Error(
      result.detail ??
        result.message ??
        'Database tables are not ready. Open /setup and click Start Setup, or run pnpm init:rds.',
    );
  }
}
