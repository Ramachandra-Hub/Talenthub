import type { PostgrestError } from '@/lib/db/get-db-service';
import { getDbService } from '@/lib/db/get-db-service';
import postgres from 'postgres';
import { ELEVATEX_MODULE_KEY } from '@/lib/elevatex';
import { resolvePostgresUrl } from '@/lib/postgres-url';

const CORE_TABLES = [
  'users',
  'test_attempts',
  'exam_violations',
  'student_active_sessions',
  'evalora_module_schedules',
  'exam_schedules',
] as const;

export function isLiveExamDbSchemaError(
  error: PostgrestError | null | undefined,
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export async function probeLiveExamDb(admin = getDbService()): Promise<{
  ready: boolean;
  missing: string[];
}> {
  if (!admin) return { ready: false, missing: [...CORE_TABLES] };

  const missing: string[] = [];
  for (const table of CORE_TABLES) {
    const { error } = await admin.from(table).select('*').limit(1);
    if (error && isLiveExamDbSchemaError(error)) missing.push(table);
  }
  return { ready: missing.length === 0, missing };
}

/** Create all tables required for live ElevateX leaderboard + proctoring. */
export async function ensureLiveExamDb(): Promise<{
  ok: boolean;
  created: boolean;
  error?: string;
  missingBefore?: string[];
}> {
  const postgresUrl = resolvePostgresUrl();
  if (!postgresUrl) {
    return { ok: false, created: false, error: 'Database connection not configured' };
  }

  const before = await probeLiveExamDb();
  const sql = postgres(postgresUrl, { max: 1, onnotice: () => {} });

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        college TEXT,
        branch TEXT,
        cgpa DECIMAL(3,2),
        phone TEXT,
        subscription_status TEXT DEFAULT 'free',
        subscription_end_date TIMESTAMPTZ,
        resume_text TEXT,
        resume_file_name TEXT,
        resume_storage_path TEXT,
        resume_updated_at TIMESTAMPTZ,
        academic_year TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS academic_year TEXT`;
    await sql`ALTER TABLE public.users ENABLE ROW LEVEL SECURITY`;
    await sql`
      DROP POLICY IF EXISTS prep_users_select_own ON public.users;
      CREATE POLICY prep_users_select_own ON public.users
        FOR SELECT TO authenticated USING (auth.uid() = id)
    `;
    await sql`
      DROP POLICY IF EXISTS prep_users_insert_own ON public.users;
      CREATE POLICY prep_users_insert_own ON public.users
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = id)
    `;
    await sql`
      DROP POLICY IF EXISTS prep_users_update_own ON public.users;
      CREATE POLICY prep_users_update_own ON public.users
        FOR UPDATE TO authenticated USING (auth.uid() = id)
    `;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.test_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        test_id TEXT,
        test_title TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        score NUMERIC(5, 2),
        percentage_score NUMERIC(5, 2),
        total_score NUMERIC(10, 2),
        answers JSONB,
        time_taken INTEGER,
        status TEXT DEFAULT 'in_progress',
        proctor_violations INTEGER DEFAULT 0,
        proctor_auto_submit BOOLEAN DEFAULT FALSE,
        proctor_session_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS test_id TEXT`;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS test_title TEXT`;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS answers JSONB`;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS proctor_violations INTEGER DEFAULT 0`;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS proctor_auto_submit BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS proctor_session_id TEXT`;

    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'test_attempts'
            AND column_name = 'test_id' AND udt_name = 'uuid'
        ) THEN
          ALTER TABLE public.test_attempts
            ALTER COLUMN test_id TYPE TEXT USING test_id::text;
        END IF;
      END $$
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_test_attempts_user_id ON public.test_attempts(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_attempts_test_id ON public.test_attempts(test_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_attempts_status_created ON public.test_attempts(status, created_at DESC)`;
    await sql`ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY`;
    await sql`
      DROP POLICY IF EXISTS prep_attempts_select_own ON public.test_attempts;
      CREATE POLICY prep_attempts_select_own ON public.test_attempts
        FOR SELECT TO authenticated USING (auth.uid() = user_id)
    `;
    await sql`
      DROP POLICY IF EXISTS prep_attempts_insert_own ON public.test_attempts;
      CREATE POLICY prep_attempts_insert_own ON public.test_attempts
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)
    `;
    await sql`
      DROP POLICY IF EXISTS prep_attempts_update_own ON public.test_attempts;
      CREATE POLICY prep_attempts_update_own ON public.test_attempts
        FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    `;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.test_attempts TO authenticated`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.exam_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        attempt_id TEXT,
        test_id TEXT,
        violation_type TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_exam_violations_user_created ON public.exam_violations(user_id, created_at DESC)`;
    await sql`ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY`;
    await sql`
      DROP POLICY IF EXISTS v2_violations_own ON public.exam_violations;
      CREATE POLICY v2_violations_own ON public.exam_violations
        FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    `;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.exam_violations TO authenticated`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.student_active_sessions (
        roll_number TEXT PRIMARY KEY,
        user_id UUID NOT NULL,
        session_id TEXT NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_student_active_sessions_user_id ON public.student_active_sessions(user_id)`;
    await sql`GRANT ALL ON public.student_active_sessions TO service_role`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.evalora_module_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module_key TEXT NOT NULL,
        title TEXT,
        notice TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        target_departments TEXT[] NOT NULL DEFAULT '{}',
        target_years TEXT[] NOT NULL DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_evalora_mod_status_starts ON public.evalora_module_schedules(status, starts_at DESC)`;
    await sql`ALTER TABLE public.evalora_module_schedules ENABLE ROW LEVEL SECURITY`;
    await sql`GRANT SELECT ON public.evalora_module_schedules TO authenticated`;
    await sql`GRANT ALL ON public.evalora_module_schedules TO service_role`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.exam_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        notice TEXT,
        faculty_exam_request_id UUID,
        test_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        target_departments TEXT[] NOT NULL DEFAULT '{}',
        target_years TEXT[] NOT NULL DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_exam_schedules_status_starts ON public.exam_schedules(status, starts_at DESC)`;
    await sql`ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY`;
    await sql`GRANT SELECT ON public.exam_schedules TO authenticated`;
    await sql`GRANT ALL ON public.exam_schedules TO service_role`;

    await sql`GRANT ALL ON public.test_attempts TO service_role`;
    await sql`GRANT ALL ON public.exam_violations TO service_role`;
    await sql`GRANT ALL ON public.users TO service_role`;

    await sql`
      INSERT INTO public.evalora_module_schedules (
        module_key, title, notice, status, starts_at, ends_at, target_departments, target_years, updated_at
      )
      SELECT
        ${ELEVATEX_MODULE_KEY},
        'ElevateX — Live exam',
        'Auto-started live window for admin dashboard and proctoring.',
        'live',
        NOW() - INTERVAL '2 hours',
        NOW() + INTERVAL '6 hours',
        '{}'::text[],
        ARRAY['III Year']::text[],
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.evalora_module_schedules
        WHERE module_key = ${ELEVATEX_MODULE_KEY} AND status = 'live'
      )
    `;

    try {
      await sql`NOTIFY pgrst, 'reload schema'`;
    } catch {
      /* optional */
    }

    return { ok: true, created: true, missingBefore: before.missing };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to bootstrap live exam database';
    return { ok: false, created: false, error: message, missingBefore: before.missing };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

let ensurePromise: Promise<boolean> | null = null;

/** Idempotent — safe to call from hot API paths (memoized per runtime). */
export async function ensureLiveExamDbIfPossible(force = false): Promise<boolean> {
  if (!force && ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const admin = getDbService();
    if (!admin) return false;

    const probe = await probeLiveExamDb(admin);
    if (probe.ready) return true;

    const result = await ensureLiveExamDb();
    if (!result.ok) return false;

    const after = await probeLiveExamDb(admin);
    return after.ready;
  })();

  return ensurePromise;
}
