/**
 * Clear exam attempts for an explicit roll list so those students can rewrite.
 * Usage: node scripts/reset-attempts-by-roll-list.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
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
}

const ROLLS = [
  '24ME1A0523', '24ME1A4206', '24ME1A05A9', '24ME1A4208', '25ME5A4603',
  '24ME1A0570', '24ME1A4920', '24ME1A5477', '24ME1A05J7', '24ME1A05C5',
  '24ME1A0527', '24ME1A0566', '24ME1A4213', '24ME1A0571', '24ME1A4287',
  '24ME1A0560', '24ME1A5482', '24ME1A0579', '24ME1A4212', '24ME1A4224',
  '24ME1A0582', '24ME1A0424', '24ME1A4638', '24ME1A54A6', '24ME1A4201',
  '24ME1A04F8', '24ME1A5499', '24ME1A4666', '24ME1A0539', '24ME1A4731',
  '24ME1A0587', '24ME1A0430', '24ME1A5472', '24ME1A42C8', '24ME1A05I6',
  '24ME1A0535', '24ME1A42B7', '24ME1A4735', '24ME1A0575', '24ME1A0538',
  '24ME1A05I8', '24ME1A05I7', '24ME1A4737', '24ME1A0544', '24ME1A42C9',
  '24ME1A42C2', '24ME1A4767', '24ME1A05D6', '24ME1A42B4', '24ME1A47C0',
  '24ME1A04G3', '24ME1A4637', '24ME1A4665', '24ME1A0415', '24ME1A42A3',
  '24ME1A4967', '24ME1A05J8', '24ME1A05I9', '25ME5A5407', '24ME1A5437',
  '24ME1A0508', '24ME1A05H3', '24ME1A05C1', '24ME1A4614', '24ME1A4223',
  '24ME1A4960', '24ME1A5468', '24ME1A04G1', '24ME1A05E9', '24ME1A05B5',
  '24ME1A04E6', '24ME1A42A5', '24ME1A04F1', '24ME1A05G7', '24ME1A4265',
  '24ME1A4620', '24ME1A4782', '24ME1A04G5', '24ME1A04E3', '24ME1A05E1',
  '24ME1A4220', '24ME1A5423', '24ME1A5402', '24ME1A05H6', '24ME1A5407',
  '24ME1A0588', '24ME1A5419', '25ME5A5404', '24ME1A05D3', '24ME1A05E0',
  '24ME1A04H9', '24ME1A5430', '24ME1A4264', '24ME1A05G9', '24ME1A05E7',
  '24ME1A04F0', '24ME1A4253', '25ME5A0416', '25ME5A0205',
];

function normalizeRoll(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

loadEnvLocal();
const apply = process.argv.includes('--apply');
const wanted = new Set(ROLLS.map(normalizeRoll));
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { NOT: { userRole: 'admin' } },
    select: { id: true, email: true, rollNumber: true, fullName: true },
  });

  const matched = users.filter((u) => {
    const roll = normalizeRoll(u.rollNumber);
    const emailLocal = normalizeRoll(u.email?.split('@')[0]);
    return wanted.has(roll) || wanted.has(emailLocal);
  });

  const found = new Set(
    matched.map((u) => normalizeRoll(u.rollNumber) || normalizeRoll(u.email?.split('@')[0])),
  );
  const missing = [...wanted].filter((r) => !found.has(r));

  console.log(`List unique rolls: ${wanted.size}`);
  console.log(`Matched students: ${matched.length}`);
  console.log(`Not found in users table: ${missing.length}`);
  if (missing.length) console.log(`  Missing: ${missing.join(', ')}`);

  const userIds = matched.map((u) => u.id);
  const attempts = userIds.length
    ? await prisma.testAttempt.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, userId: true, testTitle: true, status: true },
      })
    : [];

  console.log(`Attempts to clear: ${attempts.length}`);
  for (const u of matched) {
    const theirs = attempts.filter((a) => a.userId === u.id);
    if (!theirs.length) continue;
    console.log(
      `  ${u.rollNumber ?? u.email}: ${theirs.map((a) => `${a.testTitle ?? '(no title)'} (${a.status})`).join('; ')}`,
    );
  }

  if (!apply) {
    console.log('Dry run. Re-run with --apply to delete attempts.');
    return;
  }

  const attemptIds = attempts.map((a) => a.id);
  if (attemptIds.length) {
    const v = await prisma.examViolation.deleteMany({ where: { attemptId: { in: attemptIds } } });
    console.log(`Deleted exam_violations: ${v.count}`);
  }
  const v2 = await prisma.examViolation.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`Deleted remaining exam_violations by user: ${v2.count}`);
  const a = await prisma.testAttempt.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`Deleted test_attempts: ${a.count}`);
  const s = await prisma.studentActiveSession.deleteMany({ where: { userId: { in: userIds } } });
  console.log(`Cleared active sessions: ${s.count}`);
  console.log('Done. Those students can write the exam again.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
