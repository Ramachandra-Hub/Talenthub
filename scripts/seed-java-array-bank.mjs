#!/usr/bin/env node
/**
 * Seed Java array DSA coding problems + Java MCQs.
 * Usage: npx tsx scripts/seed-java-array-bank.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.replace(/^\uFEFF/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing in .env.local');
  }
  const { ensureJavaArrayCodingBank } = await import('../lib/coding/coding-bank-store.ts');
  const { ensureJavaCore50CodingBank } = await import('../lib/coding/coding-bank-store.ts');
  const { ensureSyllabusBankForSlugs } = await import('../lib/question-bank/seed-curated-bank-prisma.ts');
  const coding = await ensureJavaArrayCodingBank();
  const core50 = await ensureJavaCore50CodingBank();
  const mcq = await ensureSyllabusBankForSlugs(['technical-java'], 42);
  console.log(
    JSON.stringify(
      {
        javaCodingInserted: coding.inserted,
        javaCore50Inserted: core50.inserted,
        javaMcqsInserted: mcq.inserted,
        javaMcqSlugs: mcq.slugs,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
