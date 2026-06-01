import type { DbServiceClient } from '@/lib/db/get-db-service';
import { isStudentSessionLockSchemaError } from '@/lib/ensure-student-session-lock';

/** No heartbeat for this long → session lock is released automatically. */
export const STUDENT_SESSION_STALE_MS = 45 * 60 * 1000;

export type StudentSessionRow = {
  roll_number: string;
  user_id: string;
  session_id: string;
  last_seen_at: string;
  created_at: string;
};

export function normalizeStudentRoll(rollOrEmail: string): string {
  const v = rollOrEmail.trim();
  if (!v) return '';
  const local = v.includes('@') ? v.split('@')[0] ?? v : v;
  return local.replace(/\s+/g, '').toUpperCase();
}

export function sessionIdFromAccessToken(accessToken: string): string | null {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(
      Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { session_id?: string; sub?: string };
    if (payload.session_id) return String(payload.session_id);
    return accessToken.slice(0, 48);
  } catch {
    return accessToken.slice(0, 48);
  }
}

function staleCutoffIso(now = Date.now()): string {
  return new Date(now - STUDENT_SESSION_STALE_MS).toISOString();
}

export async function purgeStaleStudentSessions(
  admin: DbServiceClient,
  now = Date.now(),
): Promise<void> {
  const { error } = await admin
    .from('student_active_sessions')
    .delete()
    .lt('last_seen_at', staleCutoffIso(now));
  if (error && isStudentSessionLockSchemaError(error)) return;
}

export async function getActiveStudentSession(
  admin: DbServiceClient,
  rollNumber: string,
  now = Date.now(),
): Promise<StudentSessionRow | null> {
  const roll = normalizeStudentRoll(rollNumber);
  if (!roll) return null;

  await purgeStaleStudentSessions(admin, now);

  const { data, error } = await admin
    .from('student_active_sessions')
    .select('*')
    .eq('roll_number', roll)
    .maybeSingle();

  if (error) {
    if (isStudentSessionLockSchemaError(error)) return null;
    return null;
  }

  return (data as StudentSessionRow | null) ?? null;
}

export type ClaimStudentSessionResult = { ok: true; lockActive: boolean };

async function sessionLockTableReady(admin: DbServiceClient): Promise<boolean> {
  const { error } = await admin.from('student_active_sessions').select('roll_number').limit(1);
  if (!error) return true;
  return !isStudentSessionLockSchemaError(error);
}

export async function claimStudentSession(
  admin: DbServiceClient,
  rollNumber: string,
  userId: string,
  sessionId: string,
  now = Date.now(),
): Promise<ClaimStudentSessionResult> {
  const roll = normalizeStudentRoll(rollNumber);
  if (!roll || !userId || !sessionId) {
    return { ok: true, lockActive: false };
  }

  const lockReady = await sessionLockTableReady(admin);
  if (!lockReady) {
    return { ok: true, lockActive: false };
  }

  await purgeStaleStudentSessions(admin, now);

  const existing = await getActiveStudentSession(admin, roll, now);

  const nowIso = new Date(now).toISOString();
  const { error } = await admin.from('student_active_sessions').upsert(
    {
      roll_number: roll,
      user_id: userId,
      session_id: sessionId,
      last_seen_at: nowIso,
      created_at: existing?.created_at ?? nowIso,
    },
    { onConflict: 'roll_number' },
  );

  if (error) {
    if (isStudentSessionLockSchemaError(error)) {
      console.warn('[student-session-lock] upsert failed — table missing, allowing login');
      return { ok: true, lockActive: false };
    }
    console.warn('[student-session-lock] upsert failed — login still allowed:', error.message);
    return { ok: true, lockActive: false };
  }

  return { ok: true, lockActive: true };
}

export async function touchStudentSession(
  admin: DbServiceClient,
  rollNumber: string,
  sessionId: string,
): Promise<void> {
  const roll = normalizeStudentRoll(rollNumber);
  if (!roll || !sessionId) return;

  const { error } = await admin
    .from('student_active_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('roll_number', roll)
    .eq('session_id', sessionId);

  if (error && isStudentSessionLockSchemaError(error)) return;
}

export async function releaseStudentSession(
  admin: DbServiceClient,
  rollNumber: string,
  sessionId?: string | null,
): Promise<void> {
  const roll = normalizeStudentRoll(rollNumber);
  if (!roll) return;

  let query = admin.from('student_active_sessions').delete().eq('roll_number', roll);
  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }
  const { error } = await query;
  if (error && isStudentSessionLockSchemaError(error)) return;
}
