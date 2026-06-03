/**
 * List ElevateX attempts completed today (IST). Usage: npx tsx scripts/list-elevatex-today.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma';
import { loadElevateXResultsForDateKeyPrisma } from '../lib/admin/elevatex-results-prisma';
import { getTodayDateKeyInIST } from '../lib/admin/report-date-filter';

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

async function main() {
  loadEnvLocal();
  const dateKey = getTodayDateKeyInIST();
  const rows = await loadElevateXResultsForDateKeyPrisma(dateKey);
  console.log(`ElevateX submitted on ${dateKey} (IST): ${rows.length} student(s)\n`);
  for (const r of rows.sort((a, b) => a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true }))) {
    console.log(
      [
        r.roll_number.padEnd(10),
        (r.student_name || r.email).slice(0, 28).padEnd(28),
        `${r.overall_score}%`.padStart(6),
        r.submitted_at?.slice(0, 19) ?? '-',
        r.has_full_scorecard ? 'scorecard' : 'stored',
      ].join(' | '),
    );
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
