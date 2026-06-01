import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

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

  try {
    const root = process.cwd();
    const prismaBin =
      process.platform === 'win32'
        ? path.join(root, 'node_modules', '.bin', 'prisma.cmd')
        : path.join(root, 'node_modules', '.bin', 'prisma');
    const cmd = fs.existsSync(prismaBin) ? `"${prismaBin}"` : 'npx prisma';
    execSync(`${cmd} db push --accept-data-loss --skip-generate`, {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      message: 'Database schema is up to date (tables and columns from prisma/schema.prisma).',
    };
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: string }).stderr)
        : '';
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: 'Schema sync failed',
      detail: stderr || msg,
    };
  }
}
