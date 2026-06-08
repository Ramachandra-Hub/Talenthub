#!/usr/bin/env node
/**
 * Verify required Vercel + AWS RDS environment variables before deploy.
 * Usage: node scripts/verify-vercel-aws-env.mjs
 * Loads .env.local if present.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
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

loadEnvFile('.env.local');
loadEnvFile('.env.vercel-rds.example');
loadEnvFile('.env');

const REQUIRED = [
  'USE_AWS_STACK',
  'USE_PRISMA_AUTH',
  'NEXT_PUBLIC_USE_AWS_STACK',
  'DATABASE_URL',
  'DIRECT_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
  'NEXT_PUBLIC_APP_URL',
];

const RECOMMENDED = [
  'AUTO_RDS_SCHEMA',
  'PREPINDIA_ADMIN_EMAIL',
  'PREPINDIA_ADMIN_PASSWORD',
  'NEXT_PUBLIC_SIGNUP_DISABLED',
];

const FORBIDDEN = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

let ok = true;

console.log('Vercel + AWS RDS environment check\n');

for (const key of REQUIRED) {
  const val = process.env[key]?.trim();
  if (!val) {
    console.log(`❌ Missing required: ${key}`);
    ok = false;
  } else {
    console.log(`✅ ${key}`);
  }
}

console.log('');
for (const key of RECOMMENDED) {
  const val = process.env[key]?.trim();
  console.log(val ? `✅ ${key}` : `⚠️  Recommended: ${key}`);
}

console.log('');
for (const key of FORBIDDEN) {
  if (process.env[key]?.trim() && !process.env[key]?.includes('YOUR_')) {
    console.log(`⚠️  Remove Supabase var: ${key}`);
    ok = false;
  }
}

const dbUrl = process.env.DATABASE_URL?.trim() ?? '';
if (dbUrl.startsWith('"') || dbUrl.startsWith("'")) {
  console.log('\n❌ DATABASE_URL has surrounding quotes — remove them in Vercel');
  ok = false;
}
if (dbUrl && !/^postgres(ql)?:\/\//i.test(dbUrl)) {
  console.log('\n❌ DATABASE_URL must start with postgresql://');
  ok = false;
}
if (dbUrl && !dbUrl.includes('sslmode=require')) {
  console.log('\n⚠️  Add ?sslmode=require to DATABASE_URL for AWS RDS');
}
if (process.env.DATABASE_URL && process.env.DIRECT_URL) {
  const strip = (u) => u.replace(/^postgres(ql)?:\/\/([^:]+):([^@]+)@/, 'postgresql://$2:***@');
  if (strip(process.env.DATABASE_URL) !== strip(process.env.DIRECT_URL)) {
    console.log('\n⚠️  DATABASE_URL and DIRECT_URL should use the same host, user, and password');
  }
}

console.log(ok ? '\n✅ Ready for Vercel deploy' : '\n❌ Fix missing variables in Vercel dashboard');
process.exit(ok ? 0 : 1);
