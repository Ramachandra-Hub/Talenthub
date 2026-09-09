/**
 * Idempotent importer for DSA Arena coding contest question bank.
 *
 * Usage:
 *   pnpm exec tsx scripts/import-dsa-coding-question-bank.ts
 *   pnpm exec tsx scripts/import-dsa-coding-question-bank.ts --file path/to.json
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
  const { importDsaCodingQuestionBank } = await import('../lib/dsa/contest/import-bank');
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
  const result = await importDsaCodingQuestionBank({
    filePath,
    seedContests: !args.includes('--skip-contests'),
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        filePath: result.filePath,
        questionBank: `${result.imported} / ${result.questionCountExpected}`,
        imported: result.imported,
        rejected: result.rejected,
        duplicates: result.duplicates,
        invalid: result.invalid,
        contestsCreated: result.contests.length,
        questionsAssignedToContests: result.questionsAssignedToContests,
        poolRemainingSourceIds: result.poolRemainingSourceIds,
        contestSlugs: result.contests.map((c) => c.slug),
        warnings: result.issues.filter((i) => i.level === 'warning').length,
      },
      null,
      2,
    ),
  );
  await import('@/lib/prisma').then(({ prisma }) => prisma.$disconnect());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
