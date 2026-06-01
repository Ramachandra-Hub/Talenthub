#!/usr/bin/env node
/**
 * Test RDS reachability (TCP + Prisma login). Run on your PC after opening AWS port 5432.
 *
 *   pnpm verify:rds
 */
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseUrl(url) {
  const u = new URL(url.replace(/^postgresql:/i, 'http:'));
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

function testTcp(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, error: `TCP timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({ ok: true });
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}

loadEnv();

const url = process.env.DATABASE_URL?.trim();
if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
  console.error('❌ Set DATABASE_URL in .env.local (postgresql://...)');
  process.exit(1);
}

const { host, port, user, database } = parseUrl(url);
console.log(`\nRDS connectivity check`);
console.log(`  Host:     ${host}`);
console.log(`  Port:     ${port}`);
console.log(`  User:     ${user}`);
console.log(`  Database: ${database}\n`);

console.log('▶ TCP port test...');
const tcp = await testTcp(host, port);
if (!tcp.ok) {
  console.error(`❌ Cannot reach ${host}:${port} — ${tcp.error}`);
  console.error('\nFix in AWS (required for Vercel):');
  console.error('  1. RDS → Modify → Public access = Yes');
  console.error('  2. Security group → Inbound → PostgreSQL 5432 → 0.0.0.0/0');
  process.exit(1);
}
console.log('✓ TCP port is open\n');

console.log('▶ Prisma login test...');
execSync('npx prisma generate', { cwd: root, stdio: 'inherit' });
const probe = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
await p.$queryRaw\`SELECT 1\`;
await p.$disconnect();
console.log('ok');`,
  ],
  { cwd: root, env: process.env, encoding: 'utf8' },
);
if (probe.status !== 0) {
  console.error(probe.stderr || probe.stdout || 'Prisma connection failed');
  console.error('❌ Check RDS password, database name, and ?sslmode=require in DATABASE_URL.');
  process.exit(1);
}
console.log('✓ Prisma can connect and run SQL\n');

console.log('✅ RDS is reachable from this network. Use the same DATABASE_URL on Vercel and redeploy.\n');
