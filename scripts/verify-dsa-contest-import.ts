/**
 * Post-import verification for DSA coding contests.
 * Usage: npx tsx scripts/verify-dsa-contest-import.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(ROOT, name);
    if (!fs.existsSync(envPath)) continue;
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
}

async function main() {
  loadEnvLocal();
  const { prisma } = await import('../lib/prisma');
  const bank = await prisma.dsaProblem.count({ where: { contestBank: true } });
  const contests = await prisma.dsaCodingContest.findMany({
    where: { isPublished: true, isActive: true, status: 'active' },
    include: { _count: { select: { problems: true } } },
    orderBy: { title: 'asc' },
  });
  const bad = contests.filter((c) => c._count.problems !== 3);
  console.log(
    JSON.stringify(
      {
        contestBankProblems: bank,
        activePublishedContests: contests.length,
        contestsWithWrongProblemCount: bad.map((c) => ({
          id: c.id,
          slug: c.slug,
          count: c._count.problems,
        })),
        activeContestIds: contests.slice(0, 3).map((c) => ({ id: c.id, slug: c.slug, title: c.title })),
        firstContestProblems:
          contests[0] != null
            ? await prisma.dsaCodingContestProblem.findMany({
                where: { contestId: contests[0].id },
                orderBy: { position: 'asc' },
                include: { problem: { select: { title: true, sourceBankKey: true } } },
              })
            : [],
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
