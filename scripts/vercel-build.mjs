#!/usr/bin/env node
/**
 * Vercel production build: Prisma client + optional RDS schema sync + Next.js build.
 * Used by vercel.json → buildCommand: pnpm run vercel-build
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensurePrismaEnv } from './ensure-prisma-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
const isWin = process.platform === 'win32';

function withAwsRdsSsl(url) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const isRds =
    trimmed.includes('rds.amazonaws.com') ||
    trimmed.includes('.amazonaws.com') ||
    process.env.USE_AWS_STACK === 'true';
  if (!isRds || /[?&]sslmode=/i.test(trimmed)) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}sslmode=require`;
}

function normalizeDatabaseEnvUrls() {
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL']) {
    const raw = process.env[key]?.trim();
    if (!raw || raw.includes('YOUR_') || raw.includes('REPLACE_WITH')) continue;
    process.env[key] = withAwsRdsSsl(raw);
  }
}

/** Prefer node_modules/.bin (works on Vercel + local); fall back to pnpm exec / npx. */
function resolveCommand(name, args) {
  const ext = isWin ? '.cmd' : '';
  const local = path.join(root, 'node_modules', '.bin', `${name}${ext}`);
  if (fs.existsSync(local)) {
    return { command: local, args, shell: isWin };
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return { command: 'pnpm', args: ['exec', name, ...args], shell: false };
  }
  return { command: 'npx', args: [name, ...args], shell: false };
}

function run(name, args, { optional = false, label } = {}) {
  const display = label ?? [name, ...args].join(' ');
  console.log(`\n▶ ${display}\n`);

  const { command, args: argv, shell } = resolveCommand(name, args);
  const result = spawnSync(command, argv, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell,
  });

  if (result.error) {
    console.error(result.error.message);
    if (!optional) process.exit(1);
    console.warn(`⚠️ Optional step failed: ${display}`);
    return false;
  }

  if (result.status !== 0) {
    if (!optional) {
      console.error(`\n✗ Command failed (exit ${result.status}): ${display}\n`);
      process.exit(result.status ?? 1);
    }
    console.warn(`⚠️ Optional step failed (exit ${result.status}): ${display}`);
    return false;
  }

  return true;
}

function isValidPostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test(url.trim());
}

console.log('═══ PrepIndia Vercel + AWS RDS build ═══\n');
if (isVercel) console.log('Environment: Vercel\n');

ensurePrismaEnv();
normalizeDatabaseEnvUrls();

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.warn('⚠️  DATABASE_URL is not set — skipping prisma db push at build time.');
  console.warn('   Set DATABASE_URL in Vercel → Environment Variables.');
  console.warn('   Runtime AUTO_RDS_SCHEMA=true can sync schema on first request.\n');
} else if (!isValidPostgresUrl(dbUrl)) {
  console.warn('⚠️  DATABASE_URL must start with postgresql:// — skipping db push.');
  console.warn('   Example: postgresql://user:pass@host:5432/db?sslmode=require\n');
} else {
  console.log('✓ DATABASE_URL is set\n');
}

// On Vercel the client must be freshly generated. Locally the DLL may be
// locked by a running dev server, so treat it as optional and carry on.
run('prisma', ['generate'], { label: 'prisma generate', optional: !isVercel });

const pushAtBuild =
  process.env.VERCEL_DB_PUSH_AT_BUILD === 'true' ||
  (!isVercel && process.env.SKIP_DB_PUSH_AT_BUILD !== 'true');

if (dbUrl && isValidPostgresUrl(dbUrl) && pushAtBuild) {
  // Always optional locally — the local DB may not be running during a build check.
  run('prisma', ['db', 'push', '--accept-data-loss', '--skip-generate'], {
    optional: true,
    label: 'prisma db push (optional)',
  });
} else if (dbUrl && isValidPostgresUrl(dbUrl) && isVercel) {
  console.log(
    '⏭ Skipping prisma db push on Vercel (RDS often unreachable during build).\n' +
      '   After deploy: open /api/setup/rds or set VERCEL_DB_PUSH_AT_BUILD=true if RDS is public.\n',
  );
} else {
  console.log('⏭ Skipping prisma db push\n');
}

run('next', ['build']);

console.log('\n✅ Vercel build finished\n');
