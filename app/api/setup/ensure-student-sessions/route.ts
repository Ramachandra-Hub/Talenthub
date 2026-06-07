import { NextRequest, NextResponse } from 'next/server';
import { ensureStudentSessionLockTable } from '@/lib/ensure-student-session-lock';
import { postgresUrlSetupHint, rdsSqlEditorUrl } from '@/lib/postgres-url';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

/** Creates student_active_sessions table for one-login-per-roll enforcement. */
export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  const result = await ensureStudentSessionLockTable();

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? 'Failed to ensure student_active_sessions',
        hint: postgresUrlSetupHint(),
        sqlFile: 'db/migrations/030_student_active_sessions.sql',
        sqlEditorUrl: rdsSqlEditorUrl(),
      },
      { status: result.error?.includes('not configured') ? 400 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: 'student_active_sessions table is ready for login session locking.',
  });
}
