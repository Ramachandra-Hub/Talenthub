/**
 * Seed 120 ElevateX Slot 1 test students; remove legacy EX26001–EX26015; go live 10:00 IST today.
 * Usage: node scripts/seed-elevatex-sample.mjs
 * Writes docs/ELEVATEX_SAMPLE_CREDENTIALS.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@/lib/db/get-db-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const EMAIL_DOMAIN = 'ramachandra.edu';
const DEFAULT_PASSWORD = process.env.ELEVATEX_SAMPLE_PASSWORD || 'ElevateX2026';
const MODULE_KEY = 'placement_full';
const SLOT = 1;
const COUNT = 120;

const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical & Electronics Engineering',
  'Electronics & Communication Engineering',
  'Computer Science Engineering',
  'Computer Science Engineering (Cyber Security)',
  'Computer Science Engineering (Internet of Things)',
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence & Machine Learning',
  'Business Administration',
];

const LEGACY_ROLLS = Array.from({ length: 15 }, (_, i) => `EX260${String(i + 1).padStart(2, '0')}`);

const STUDENTS = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  return {
    roll: `EXS1${String(n).padStart(3, '0')}`,
    fullName: `ElevateX Slot ${SLOT} Test ${String(n).padStart(2, '0')}`,
    department: DEPARTMENTS[i % DEPARTMENTS.length],
    year: 'III Year',
  };
});

function todayIsoInIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function slot1Window(dateIso) {
  return {
    startsAt: new Date(`${dateIso}T10:00:00+05:30`).toISOString(),
    endsAt: new Date(`${dateIso}T12:00:00+05:30`).toISOString(),
  };
}

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

function studentEmail(roll) {
  return `${roll.trim().toLowerCase()}@student.${EMAIL_DOMAIN}`;
}

async function listAllUsers(supabaseUrl, serviceKey) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return [];
  const payload = await res.json();
  return payload.users ?? [];
}

async function deleteLegacy(admin, supabaseUrl, serviceKey) {
  const users = await listAllUsers(supabaseUrl, serviceKey);
  const removed = [];
  for (const roll of LEGACY_ROLLS) {
    const email = studentEmail(roll);
    const user = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!user?.id) continue;
    const delRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (delRes.ok) {
      await admin.from('users').delete().eq('id', user.id);
      removed.push(roll);
      console.log(`  🗑 Removed legacy ${roll}`);
    }
  }
  return removed;
}

async function upsertStudent(admin, supabaseUrl, serviceKey, student, password) {
  const email = studentEmail(student.roll);
  const meta = {
    full_name: student.fullName,
    role: 'student',
    department: student.department,
    branch: student.department,
    year: student.year,
    academic_year: student.year,
    roll: student.roll,
    roll_number: student.roll,
  };

  const users = await listAllUsers(supabaseUrl, serviceKey);
  const existing = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  let userId;

  if (existing?.id) {
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_confirm: true, password, user_metadata: meta }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      throw new Error(`${email}: ${err.msg ?? err.message ?? updateRes.status}`);
    }
    userId = existing.id;
  } else {
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
    });
    const data = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !data.id) {
      throw new Error(`${email}: ${data.msg ?? data.message ?? createRes.status}`);
    }
    userId = data.id;
  }

  const { error: profileErr } = await admin.from('users').upsert(
    {
      id: userId,
      email,
      full_name: student.fullName,
      branch: student.department,
      academic_year: student.year,
      user_role: 'student',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (profileErr) {
    console.warn(`  ⚠ ${email} profile skipped: ${profileErr.message}`);
  }
  return { email, userId };
}

function writeCredentialsCsv(rows) {
  const lines = ['roll,email,password,department,year'];
  for (const r of rows) {
    const row = [r.roll, r.email, DEFAULT_PASSWORD, r.department, r.year]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
    lines.push(row);
  }
  const outPath = path.join(ROOT, 'public', 'elevatex-slot1-credentials.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

function writeCredentialsDoc(rows, scheduleId, slotDate, window) {
  const lines = [
    '# ElevateX — Slot 1 test credentials (42 students)',
    '',
    'Generated by `node scripts/seed-elevatex-sample.mjs`.',
    '',
    '## Exam window',
    '',
    `- **Slot:** ${SLOT}`,
    `- **Date:** ${slotDate} (IST)`,
    `- **Time:** 10:00 AM – 12:00 PM IST (exam ~60 minutes)`,
    `- **Rolls:** EXS1001 – EXS1042`,
    '- **Legacy removed:** EX26001 – EX26015',
    '',
    scheduleId ? `- **Schedule id:** \`${scheduleId}\`` : '',
    '',
    '- **Student login:** `/auth/login/student`',
    '- **Take exam:** `/placement` → Start assessment (hall ticket = roll number)',
    '',
    '## Shared password',
    '',
    `\`${DEFAULT_PASSWORD}\``,
    '',
    '## Student logins',
    '',
    '| # | Roll | Email | Department | Year |',
    '|---|------|-------|------------|------|',
  ];

  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.roll} | ${r.email} | ${r.department} | ${r.year} |`);
  });

  lines.push(
    '',
    '## Quick test',
    '',
    '1. Sign in as `EXS1001` with the password above.',
    '2. Open **ElevateX** from `/placement` after **10:00 AM IST** on exam day.',
    '3. Hall ticket = roll number; pick the matching department.',
    '',
    `Window: ${window.startsAt} → ${window.endsAt}`,
    '',
  );

  const outPath = path.join(ROOT, 'docs', 'ELEVATEX_SAMPLE_CREDENTIALS.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey || serviceKey.includes('YOUR_')) {
  console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const slotDate = todayIsoInIst();
const window = slot1Window(slotDate);

console.log('▶ Removing legacy EX26001–EX26015…');
const legacyRemoved = await deleteLegacy(admin, url, serviceKey);
console.log(`  Removed ${legacyRemoved.length} legacy account(s)`);

console.log(`▶ Creating ${COUNT} ElevateX Slot 1 students…`);
const created = [];
for (const s of STUDENTS) {
  const row = await upsertStudent(admin, url, serviceKey, s, DEFAULT_PASSWORD);
  created.push({ ...s, email: row.email });
  console.log(`  ✅ ${s.roll}`);
}

console.log('▶ Go-live ElevateX Slot 1 (10:00 AM IST)…');

const { data: liveRows } = await admin
  .from('evalora_module_schedules')
  .select('id')
  .eq('module_key', MODULE_KEY)
  .eq('status', 'live');

if (liveRows?.length) {
  await admin
    .from('evalora_module_schedules')
    .update({ status: 'ended', updated_at: new Date().toISOString() })
    .in(
      'id',
      liveRows.map((r) => r.id),
    );
}

const { data: schedule, error: schedErr } = await admin
  .from('evalora_module_schedules')
  .insert({
    module_key: MODULE_KEY,
    title: `ElevateX — Slot ${SLOT} test (${slotDate})`,
    notice: `Slot ${SLOT} · 10:00 AM IST · EXS1001–EXS1042 · 60 min paper.`,
    status: 'live',
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    target_departments: [],
    target_years: ['III Year'],
    updated_at: new Date().toISOString(),
  })
  .select('id')
  .single();

let scheduleId = schedule?.id ?? null;
if (schedErr) {
  console.error('❌ Schedule insert failed:', schedErr.message);
} else {
  console.log(`  ✅ Schedule ${scheduleId} (${slotDate} 10:00–12:00 IST)`);
}

const docPath = writeCredentialsDoc(created, scheduleId, slotDate, window);
const csvPath = writeCredentialsCsv(created);
console.log('');
console.log(`✅ ${COUNT} ElevateX test accounts ready`);
console.log(`   Credentials: ${docPath}`);
console.log(`   CSV:         ${csvPath}`);
console.log(`   Password:    ${DEFAULT_PASSWORD}`);
if (!scheduleId) {
  process.exit(schedErr ? 1 : 0);
}
