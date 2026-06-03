/**
 * Find or backfill ElevateX scorecards in Postgres.
 *
 * Usage:
 *   npx tsx scripts/recover-elevatex-scorecard.ts --roll EXS1001
 *   npx tsx scripts/recover-elevatex-scorecard.ts --attempt <uuid>
 *   npx tsx scripts/recover-elevatex-scorecard.ts --attempt <uuid> --backfill
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1] ?? '').trim() : '';
}

async function main() {
  loadEnvLocal();
  const roll = arg('roll');
  const attemptId = arg('attempt');
  const backfill = process.argv.includes('--backfill');

  if (!roll && !attemptId) {
    console.error('Provide --roll EXS1001 or --attempt <uuid>');
    process.exit(1);
  }

  const {
    findElevateXScorecardByRoll,
    findElevateXScorecardForUserId,
    backfillElevateXScorecardToAttemptPrisma,
  } = await import('../lib/placement/elevatex-scorecard-recovery.ts');
  const { fetchElevateXScorecardForAttemptPrisma } = await import(
    '../lib/placement/fetch-elevatex-scorecard-prisma.ts'
  );
  const { prisma } = await import('../lib/prisma.ts');

  if (roll) {
    const hit = await findElevateXScorecardByRoll(roll);
    if (!hit) {
      console.log(`No scorecard found for roll ${roll}.`);
      process.exit(1);
    }
    console.log('Found scorecard for roll', roll);
    console.log(JSON.stringify({ ...hit, sections: hit.scorecard.sections.length }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const loaded = await fetchElevateXScorecardForAttemptPrisma(attemptId);
  if ('scorecard' in loaded) {
    console.log('Scorecard already readable for attempt', attemptId);
    console.log(
      JSON.stringify(
        {
          source: loaded.source,
          percentage: loaded.scorecard.percentage,
          roll: loaded.scorecard.candidate.hallTicket,
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  console.log('Lookup failed:', loaded.error);

  const row = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true },
  });
  if (row) {
    const hit = await findElevateXScorecardForUserId(row.userId);
    if (hit) {
      console.log('\nScorecard exists for same student on another row:');
      console.log(JSON.stringify(hit, null, 2));
      if (backfill) {
        const bf = await backfillElevateXScorecardToAttemptPrisma(attemptId);
        console.log('\nBackfill:', bf);
      } else {
        console.log('\nRe-run with --backfill to copy scorecard onto this attempt id.');
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
