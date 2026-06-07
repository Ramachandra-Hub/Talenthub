/**
 * Production database migration helper for existing AWS RDS instances.
 *
 * Fresh database:
 *   pnpm exec prisma migrate deploy
 *
 * Existing database (schema already applied manually or via db push):
 *   node scripts/prisma-migrate-production.mjs --baseline
 *
 * Then always use:
 *   pnpm exec prisma migrate deploy
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const baseline = process.argv.includes('--baseline');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (baseline) {
  console.log('Marking 0_init as applied (existing RDS schema)...');
  run('pnpm', ['exec', 'prisma', 'migrate', 'resolve', '--applied', '0_init']);
}

console.log('Applying pending migrations...');
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
console.log('Done.');
