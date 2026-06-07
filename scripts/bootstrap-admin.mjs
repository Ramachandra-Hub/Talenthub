/**
 * Create or reset the default admin in Supabase Auth + admin_users.
 * Usage: node scripts/bootstrap-admin.mjs
 * Reads apps/prepindia-web/.env.local (PREPINDIA_ADMIN_EMAIL / PREPINDIA_ADMIN_PASSWORD).
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

async function findUserByEmail(supabaseUrl, serviceKey, email) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const payload = await res.json();
  const users = payload.users ?? [];
  return users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) ?? null;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = (process.env.PREPINDIA_ADMIN_EMAIL || 'admin@rce.ac.in').trim().toLowerCase();
const password = process.env.PREPINDIA_ADMIN_PASSWORD?.trim();
if (!password) {
  console.error('❌ Set PREPINDIA_ADMIN_PASSWORD in .env.local (required — no default password).');
  process.exit(1);
}
const fullName = 'RCE Training & Placement Admin';

if (!url || !serviceKey || serviceKey.includes('YOUR_')) {
  console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId;

const existing = await findUserByEmail(url, serviceKey, email);
if (existing?.id) {
  console.log(`▶ Admin exists (${email}), resetting password…`);
  const updateRes = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_confirm: true,
      password,
      user_metadata: { full_name: fullName, role: 'admin' },
    }),
  });
  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    console.error('❌ Could not update password:', err.msg ?? err.message ?? updateRes.status);
    process.exit(1);
  }
  userId = existing.id;
} else {
  console.log(`▶ Creating admin (${email})…`);
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'admin' },
    }),
  });
  const data = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !data.id) {
    console.error('❌ Create failed:', data.msg ?? data.message ?? createRes.status);
    process.exit(1);
  }
  userId = data.id;
}

await admin.from('users').upsert(
  { id: userId, email, full_name: fullName, updated_at: new Date().toISOString() },
  { onConflict: 'id' },
);

const { error: adminErr } = await admin
  .from('admin_users')
  .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' });

if (adminErr) {
  console.warn('⚠ admin_users:', adminErr.message);
  console.warn('  Run supabase/migrations/004_users_and_admin_setup.sql in Supabase SQL editor.');
} else {
  console.log('✅ admin_users row ready');
}

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
if (anonKey && !anonKey.includes('YOUR_')) {
  const pub = createClient(url, anonKey);
  const { error: signInErr } = await pub.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.error('❌ Sign-in test failed:', signInErr.message);
    process.exit(1);
  }
  console.log('✅ Sign-in test passed');
  await pub.auth.signOut();
}

console.log('');
console.log('Admin login:');
console.log('  URL:      /auth/login/admin');
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
