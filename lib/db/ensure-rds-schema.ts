import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

function runPrismaDbPush(): { ok: true } | { ok: false; detail: string } {
  const root = process.cwd();
  const isWin = process.platform === 'win32';
  const localBin = path.join(root, 'node_modules', '.bin', isWin ? 'prisma.cmd' : 'prisma');

  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      shell: isWin,
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
    return run(localBin, ['db', 'push', '--accept-data-loss', '--skip-generate']);
  }
  return run('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate']);
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

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      message: 'Database schema is up to date (tables and columns from prisma/schema.prisma).',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: 'Schema sync failed',
      detail: msg,
    };
  }
}
