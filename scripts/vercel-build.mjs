#!/usr/bin/env node
/**
 * Vercel production build: Prisma client + RDS schema sync + Next.js build.
 * Used by vercel.json → buildCommand: pnpm run vercel-build
 *
 * Requires DATABASE_URL in Vercel Environment Variables (Production).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}\n`);
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
    shell: true,
  });
}

function prismaBin() {
  const win = path.join(root, 'node_modules', '.bin', 'prisma.cmd');
  const unix = path.join(root, 'node_modules', '.bin', 'prisma');
  if (process.platform === 'win32' && fs.existsSync(win)) return `"${win}"`;
  if (fs.existsSync(unix)) return `"${unix}"`;
  return 'npx prisma';
}

console.log('═══ PrepIndia Vercel + AWS RDS build ═══\n');

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.warn(
    '⚠️  DATABASE_URL is not set — skipping prisma db push at build time.',
  );
  console.warn('   Set DATABASE_URL in Vercel → Settings → Environment Variables.');
  console.warn('   Runtime AUTO_RDS_SCHEMA=true will try on first request.\n');
} else {
  console.log('✓ DATABASE_URL is set (schema will sync to RDS during build)\n');
}

const prisma = prismaBin();

run(`${prisma} generate`);

if (dbUrl) {
  run(`${prisma} db push --accept-data-loss --skip-generate`);
} else {
  console.log('⏭ Skipping prisma db push (no DATABASE_URL)\n');
}

function nextBin() {
  const win = path.join(root, 'node_modules', '.bin', 'next.cmd');
  const unix = path.join(root, 'node_modules', '.bin', 'next');
  if (process.platform === 'win32' && fs.existsSync(win)) return `"${win}"`;
  if (fs.existsSync(unix)) return `"${unix}"`;
  return 'npx next';
}

run(`${nextBin()} build`);

console.log('\n✅ Vercel build finished\n');
