import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

let contestTablesReady = false;

/**
 * Apply additive contest schema on existing deployments (IF NOT EXISTS / DO blocks).
 */
export async function ensureDsaContestTables(): Promise<void> {
  if (contestTablesReady) return;
  const migrationPath = path.join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260909140000_dsa_coding_contests',
    'migration.sql',
  );
  try {
    const sql = readFileSync(migrationPath, 'utf8');
    // Split on semicolons that end statements, but keep DO $$ ... $$ blocks intact.
    const chunks: string[] = [];
    let buf = '';
    let inDo = false;
    for (const line of sql.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) continue;
      if (/^DO\s+\$\$/i.test(trimmed)) inDo = true;
      buf += `${line}\n`;
      if (inDo && /END\s+\$\$\s*;?\s*$/i.test(trimmed)) {
        inDo = false;
        chunks.push(buf.trim());
        buf = '';
        continue;
      }
      if (!inDo && trimmed.endsWith(';')) {
        chunks.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) chunks.push(buf.trim());

    for (const chunk of chunks) {
      if (!chunk) continue;
      try {
        await prisma.$executeRawUnsafe(chunk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Ignore benign "already exists" / duplicate column races
        if (!/already exists|duplicate/i.test(msg)) {
          console.warn('[dsa-contest] migration chunk warning:', msg.slice(0, 200));
        }
      }
    }
  } catch (err) {
    console.warn(
      '[dsa-contest] ensure tables skipped:',
      err instanceof Error ? err.message : err,
    );
  }
  contestTablesReady = true;
}
