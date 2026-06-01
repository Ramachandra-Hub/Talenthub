/**
 * Regenerate public/elevatex-slot1-credentials.csv from current ELEVATEX_SAMPLE_COUNT.
 * Usage: node scripts/write-elevatex-csv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COUNT = 120;
const PASSWORD = process.env.ELEVATEX_SAMPLE_PASSWORD || 'ElevateX2026';
const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical & Electronics Engineering',
  'Electronics & Communication Engineering',
  'Computer Science & Engineering',
  'Information Technology',
  'Chemical Engineering',
  'Biotechnology',
];

const lines = ['roll,email,password,department,year'];
for (let i = 1; i <= COUNT; i++) {
  const roll = `EXS1${String(i).padStart(3, '0')}`;
  const email = `${roll.toLowerCase()}@student.ramachandra.edu`;
  const dept = DEPARTMENTS[(i - 1) % DEPARTMENTS.length];
  const row = [roll, email, PASSWORD, dept, 'III Year']
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(',');
  lines.push(row);
}

const outPath = path.join(ROOT, 'public', 'elevatex-slot1-credentials.csv');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${COUNT} rows to ${outPath}`);
