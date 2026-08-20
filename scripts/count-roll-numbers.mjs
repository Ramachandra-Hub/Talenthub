import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  const key = t.slice(0, i).trim();
  let val = t.slice(i + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  where: { NOT: { userRole: 'admin' } },
  select: { rollNumber: true },
});
const withRoll = users.filter((u) => String(u.rollNumber || '').trim());
const unique = new Set(withRoll.map((u) => String(u.rollNumber).trim().toUpperCase()));
console.log(`totalStudents=${users.length}`);
console.log(`studentsWithRollNumber=${withRoll.length}`);
console.log(`uniqueRollNumbers=${unique.size}`);
console.log(`studentsWithoutRollNumber=${users.length - withRoll.length}`);
await prisma.$disconnect();
