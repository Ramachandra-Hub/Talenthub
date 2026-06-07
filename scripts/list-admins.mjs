/**
 * List admin accounts (emails only — passwords are not stored in the app DB).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@/lib/db/get-db-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error('Missing Supabase env in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const allowlist = new Set(
  ['admin@rce.ac.in', process.env.PREPINDIA_ADMIN_EMAIL?.trim().toLowerCase()].filter(Boolean),
);

console.log('=== Configured default admin (from .env / code) ===');
console.log('  Email:', process.env.PREPINDIA_ADMIN_EMAIL || 'admin@rce.ac.in');
console.log('  Password: set in PREPINDIA_ADMIN_PASSWORD (required in .env.local)');
console.log('  (Passwords are hashed in Supabase Auth — not readable from the database.)');
console.log('');

console.log('=== public.admin_users table ===');
const { data: rows, error: tableErr } = await admin
  .from('admin_users')
  .select('user_id, role, created_at');

if (tableErr) {
  console.log('  (table unavailable:', tableErr.message + ')');
} else if (!rows?.length) {
  console.log('  0 rows — no admins registered in admin_users yet.');
} else {
  console.log(`  ${rows.length} row(s):`);
  for (const r of rows) {
    const { data: u } = await admin.from('users').select('email, full_name').eq('id', r.user_id).maybeSingle();
    console.log(`  - ${u?.email ?? '(no profile)'}  user_id=${r.user_id}  role=${r.role}`);
  }
}

console.log('');
console.log('=== Supabase Auth users (scan for admin role / allowlist) ===');

let page = 1;
const perPage = 200;
const authAdmins = [];

while (true) {
  const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) {
    console.log('  Could not list auth users:', res.status);
    break;
  }
  const payload = await res.json();
  const users = payload.users ?? [];
  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    const metaRole = u.user_metadata?.role ?? u.app_metadata?.role ?? '';
    const inTable = rows?.some((r) => r.user_id === u.id);
    if (metaRole === 'admin' || allowlist.has(email) || inTable) {
      authAdmins.push({
        email: u.email,
        id: u.id,
        metaRole: metaRole || '(none)',
        inAdminUsersTable: !!inTable,
        allowlisted: allowlist.has(email),
        created: u.created_at,
      });
    }
  }
  if (users.length < perPage) break;
  page += 1;
}

if (!authAdmins.length) {
  console.log('  No auth users matched admin criteria.');
} else {
  console.log(`  ${authAdmins.length} account(s):`);
  for (const a of authAdmins) {
    console.log(
      `  - ${a.email}  id=${a.id}  metadata.role=${a.metaRole}  in_admin_users=${a.inAdminUsersTable}  allowlisted=${a.allowlisted}`,
    );
  }
}
