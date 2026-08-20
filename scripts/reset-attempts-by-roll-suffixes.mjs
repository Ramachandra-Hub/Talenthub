/**
 * Clear exam attempts for listed roll suffixes so those students can rewrite.
 * Dry-run by default. Apply: node scripts/reset-attempts-by-roll-suffixes.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUFFIXES = [
  '21', '25', '31', '35', '41', '43', '46', '55', '60', '61', '64', '71', '73', '78',
  '82', '84', '86', '93', '94', '99', 'A1', 'A6', 'A8', 'B0', 'B5', 'C0', 'C1', 'C4',
  'C8', 'D5', 'D7',
];

function normalizeRoll(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function matchesSuffix(roll) {
  const n = normalizeRoll(roll);
  if (!n) return false;
  return SUFFIXES.some((suffix) => n === suffix || n.endsWith(suffix));
}

loadEnvLocal();
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { userRole: { not: 'admin' } },
    select: { id: true, email: true, rollNumber: true, fullName: true },
  });

  const matched = users.filter((u) => {
    const fromEmail = u.email?.split('@')[0] ?? '';
    return matchesSuffix(u.rollNumber) || matchesSuffix(fromEmail);
  });

  console.log(`Matched ${matched.length} student(s) of ${users.length}:`);
  for (const u of matched) {
    console.log(`  ${u.rollNumber ?? '(no roll)'}  ${u.email}  ${u.fullName ?? ''}`);
  }

  const userIds = matched.map((u) => u.id);
  if (!userIds.length) {
    console.log('No matching students. Nothing to do.');
    return;
  }

  const allAttempts = await prisma.testAttempt.findMany({
    where: { userId: { in: userIds } },
    select: {
      id: true,
      userId: true,
      testId: true,
      testTitle: true,
      status: true,
      completedAt: true,
    },
  });

  const attempts = allAttempts.filter((a) => /java/i.test(String(a.testTitle ?? '')));
  const titles = [...new Set(allAttempts.map((a) => a.testTitle || a.testId || '(untitled)'))];
  console.log(`All attempts for matched rolls: ${allAttempts.length}. Titles: ${titles.join(' | ') || 'none'}`);

  const javaUserIds = [...new Set(attempts.map((a) => a.userId))];
  const javaStudents = matched.filter((u) => javaUserIds.includes(u.id));

  console.log(`Java-exam attempts among those rolls: ${attempts.length} from ${javaStudents.length} student(s)`);
  for (const u of javaStudents) {
    const theirs = attempts.filter((a) => a.userId === u.id);
    console.log(
      `  ${u.rollNumber ?? u.email}  ${theirs.map((a) => `${a.testTitle ?? a.testId} (${a.status})`).join('; ')}`,
    );
  }

  if (!apply) {
    console.log('Dry run. Re-run with --apply to delete those Java attempts so they can rewrite.');
    return;
  }

  const attemptIds = attempts.map((a) => a.id);
  if (!attemptIds.length) {
    console.log('No Java attempts to delete.');
    return;
  }

  const v = await prisma.examViolation.deleteMany({ where: { attemptId: { in: attemptIds } } });
  console.log(`Deleted exam_violations: ${v.count}`);

  const a = await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  console.log(`Deleted test_attempts: ${a.count}`);

  const s = await prisma.studentActiveSession.deleteMany({ where: { userId: { in: javaUserIds } } });
  console.log(`Cleared active sessions: ${s.count}`);

  console.log('Done. Those students can write the Java exam again.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
