import type { PostgrestError } from '@/lib/db/get-db-service';
import { getDbService } from '@/lib/db/get-db-service';
import postgres from 'postgres';
import { resolvePostgresUrl } from '@/lib/postgres-url';

export function isExamViolationsSchemaError(
  error: Pick<PostgrestError, 'code' | 'message'> | null | undefined,
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (msg.includes('exam_violations') &&
      (msg.includes('does not exist') ||
        msg.includes('could not find') ||
        msg.includes('schema cache')))
  );
}

export async function ensureExamViolationsTable(): Promise<{
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
      CREATE TABLE IF NOT EXISTS public.exam_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        attempt_id TEXT,
        test_id TEXT,
        violation_type TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'exam_violations'
            AND column_name = 'test_id'
            AND udt_name = 'uuid'
        ) THEN
          ALTER TABLE public.exam_violations
            ALTER COLUMN test_id TYPE TEXT USING test_id::text;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'exam_violations'
            AND column_name = 'attempt_id'
            AND udt_name = 'uuid'
        ) THEN
          ALTER TABLE public.exam_violations
            ALTER COLUMN attempt_id TYPE TEXT USING attempt_id::text;
        END IF;
      END $$;
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_exam_violations_user_created
        ON public.exam_violations (user_id, created_at DESC);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_exam_violations_test_created
        ON public.exam_violations (test_id, created_at DESC);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_exam_violations_type_created
        ON public.exam_violations (violation_type, created_at DESC);
    `;

    await sql`ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY`;
    await sql`
      DROP POLICY IF EXISTS v2_violations_own ON public.exam_violations;
      CREATE POLICY v2_violations_own ON public.exam_violations
        FOR ALL TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.exam_violations TO authenticated`;
    await sql`GRANT ALL ON public.exam_violations TO service_role`;

    try {
      await sql`NOTIFY pgrst, 'reload schema'`;
    } catch {
      /* optional */
    }

    return { ok: true, created: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create exam_violations';
    return { ok: false, created: false, error: message };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function ensureExamViolationsTableIfPossible(): Promise<boolean> {
  const admin = getDbService();
  if (!admin) return false;

  const probe = await admin.from('exam_violations').select('id').limit(1);
  if (!probe.error) return true;
  if (!isExamViolationsSchemaError(probe.error)) return false;

  const result = await ensureExamViolationsTable();
  return result.ok;
}
