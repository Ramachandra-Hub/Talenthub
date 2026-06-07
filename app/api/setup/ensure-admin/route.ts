import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { postgresUrlSetupHint, resolvePostgresUrl } from '@/lib/postgres-url';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

/** Creates public.admin_users + RLS (non-destructive). */
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
      CREATE TABLE IF NOT EXISTS public.admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'admin',
        permissions JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      );
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);`;
    await sql`ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY`;

    await sql`
      DROP POLICY IF EXISTS prep_admin_users_select_own ON public.admin_users;
      CREATE POLICY prep_admin_users_select_own ON public.admin_users
        FOR SELECT USING (auth.uid() = user_id);
    `;

    await sql`GRANT SELECT ON public.admin_users TO authenticated`;

    try {
      await sql`NOTIFY pgrst, 'reload schema'`;
    } catch {
      /* optional */
    }

    await sql.end();

    return NextResponse.json({
      success: true,
      message: 'admin_users table is ready.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Setup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
