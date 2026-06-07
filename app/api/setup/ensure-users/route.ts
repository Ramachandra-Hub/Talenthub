import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { postgresUrlSetupHint, resolvePostgresUrl } from '@/lib/postgres-url';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

/** Non-destructive: creates public.users + resume columns + RLS (does not drop other tables). */
export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  try {
    const postgresUrl = resolvePostgresUrl();
    if (!postgresUrl) {
      return NextResponse.json(
        {
          error: 'Database connection not configured',
          hint: postgresUrlSetupHint(),
          sqlFile: 'db/migrations/004_users_and_admin_setup.sql',
          sqlEditorUrl:
            'https://console.aws.amazon.com/rds/project/lwkmfpcewpisezmcsext/sql/new',
        },
        { status: 400 },
      );
    }

    const sql = postgres(postgresUrl, { max: 1, onnotice: () => {} });

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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_text TEXT`;
    await sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_file_name TEXT`;
    await sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_storage_path TEXT`;
    await sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_updated_at TIMESTAMPTZ`;

    await sql`ALTER TABLE public.users ENABLE ROW LEVEL SECURITY`;

    await sql`
      DROP POLICY IF EXISTS prep_users_select_own ON public.users;
      CREATE POLICY prep_users_select_own ON public.users
        FOR SELECT USING (auth.uid() = id);
    `;
    await sql`
      DROP POLICY IF EXISTS prep_users_insert_own ON public.users;
      CREATE POLICY prep_users_insert_own ON public.users
        FOR INSERT WITH CHECK (auth.uid() = id);
    `;
    await sql`
      DROP POLICY IF EXISTS prep_users_update_own ON public.users;
      CREATE POLICY prep_users_update_own ON public.users
        FOR UPDATE USING (auth.uid() = id);
    `;

    await sql`
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('student-resumes', 'student-resumes', false)
      ON CONFLICT (id) DO NOTHING;
    `;

    await sql`GRANT USAGE ON SCHEMA public TO anon, authenticated`;
    await sql`GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated`;
    await sql`GRANT SELECT ON public.users TO anon`;

    try {
      await sql`NOTIFY pgrst, 'reload schema'`;
    } catch {
      /* optional on some hosts */
    }

    await sql.end();

    return NextResponse.json({
      success: true,
      message: 'public.users table and student policies are ready.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to ensure users table',
      },
      { status: 500 },
    );
  }
}
