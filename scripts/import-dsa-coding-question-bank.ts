/**
 * Idempotent importer for DSA Arena coding contest question bank.
 *
 * Usage:
 *   pnpm exec tsx scripts/import-dsa-coding-question-bank.ts
 *   pnpm exec tsx scripts/import-dsa-coding-question-bank.ts --file path/to.json
 */
import { importDsaCodingQuestionBank } from '../lib/dsa/contest/import-bank';

async function main() {
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
        imported: result.imported,
        contests: result.contests.length,
        contestSlugs: result.contests.map((c) => c.slug),
        warnings: result.issues.filter((i) => i.level === 'warning').length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
