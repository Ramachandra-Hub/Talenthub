import type { PostgrestError } from '@/lib/db/get-db-service';
import { getDbService } from '@/lib/db/get-db-service';
import postgres from 'postgres';
import { resolvePostgresUrl } from '@/lib/postgres-url';

export function isStudentSessionLockSchemaError(
  error: PostgrestError | null | undefined,
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (msg.includes('student_active_sessions') &&
      (msg.includes('does not exist') ||
        msg.includes('could not find') ||
        msg.includes('schema cache')))
  );
}

export async function ensureStudentSessionLockTable(): Promise<{
  ok: boolean;
  created: boolean;
  error?: string;
}> {
  const postgresUrl = resolvePostgresUrl();
  if (!postgresUrl) {
    return { ok: false, created: false, error: 'Database connection not configured' };
  }

  const sql = postgres(postgresUrl, { max: 1, onnotice: () => {} });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.student_active_sessions (
        roll_number text PRIMARY KEY,
        user_id uuid NOT NULL,
        session_id text NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_active_sessions_user_id
        ON public.student_active_sessions (user_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_active_sessions_last_seen
        ON public.student_active_sessions (last_seen_at DESC);
    `;
    await sql`GRANT ALL ON public.student_active_sessions TO service_role`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_active_sessions TO service_role`;

    try {
      await sql`NOTIFY pgrst, 'reload schema'`;
    } catch {
      /* optional */
    }

    return { ok: true, created: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create student_active_sessions';
    return { ok: false, created: false, error: message };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Create table via direct Postgres when missing; no-op if already present. */
export async function ensureStudentSessionLockTableIfPossible(): Promise<boolean> {
  const admin = getDbService();
  if (!admin) return false;

  const probe = await admin.from('student_active_sessions').select('roll_number').limit(1);
  if (!probe.error) return true;

  if (!isStudentSessionLockSchemaError(probe.error)) return false;

  const result = await ensureStudentSessionLockTable();
  return result.ok;
}
