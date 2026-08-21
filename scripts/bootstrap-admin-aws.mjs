/**
 * Bootstrap default admin in RDS via Prisma (bcrypt password).
 * Usage: node scripts/bootstrap-admin-aws.mjs
 * Requires: DATABASE_URL, PREPINDIA_ADMIN_EMAIL, PREPINDIA_ADMIN_PASSWORD
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  for (const name of ['.env.production', '.env.local', '.env']) {
    const envPath = path.join(__dirname, '..', name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

loadEnvLocal();

const email = (process.env.PREPINDIA_ADMIN_EMAIL || 'admin@rce.ac.in').trim().toLowerCase();
const password = process.env.PREPINDIA_ADMIN_PASSWORD?.trim();
if (!password || password.length < 8) {
  console.error('❌ Set PREPINDIA_ADMIN_PASSWORD (min 8 chars) in the environment');
  process.exit(1);
}
const fullName = 'RCE Training & Placement Admin';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is required');
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 12);

try {
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      fullName,
    },
    update: {
      passwordHash,
      fullName,
    },
  });

  await prisma.adminUser.upsert({
    where: { userId: user.id },
    create: { userId: user.id, role: 'admin' },
    update: { role: 'admin' },
  });

  console.log('✅ Admin ready in RDS');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log('   Login:    /auth/login/admin');
} catch (err) {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
