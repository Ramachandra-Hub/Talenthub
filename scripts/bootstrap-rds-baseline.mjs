/**
 * Seed baseline data + admin on fresh RDS (used by init-rds-fresh.mjs).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', name);
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

loadEnv();

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Quantitative Ability', slug: 'quantitative', icon: '📊', order: 1 },
  { name: 'Verbal Ability', slug: 'verbal', icon: '📖', order: 2 },
  { name: 'Logical Reasoning', slug: 'logical', icon: '🧠', order: 3 },
  { name: 'Coding', slug: 'coding', icon: '💻', order: 4 },
];

const email = (process.env.PREPINDIA_ADMIN_EMAIL || 'admin@rce.ac.in').trim().toLowerCase();
const password = process.env.PREPINDIA_ADMIN_PASSWORD?.trim();
if (!password) {
  console.error('❌ Set PREPINDIA_ADMIN_PASSWORD in .env.local (required).');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);

const user = await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash: hash, fullName: 'Admin' },
  update: { passwordHash: hash },
});

await prisma.adminUser.upsert({
  where: { userId: user.id },
  create: { userId: user.id, role: 'admin' },
  update: { role: 'admin' },
});

console.log(`✅ Admin: ${email}`);

for (const cat of CATEGORIES) {
  await prisma.testCategory.upsert({
    where: { slug: cat.slug },
    create: { ...cat, description: cat.name },
    update: { name: cat.name, icon: cat.icon, order: cat.order },
  });
}

console.log(`✅ ${CATEGORIES.length} test categories`);

await prisma.$disconnect();
