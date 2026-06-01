import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { resetElevateXSampleStudents } from '@/lib/elevatex-sample-seed';
import { ELEVATEX_SAMPLE_COUNT } from '@/lib/elevatex-sample-credentials';

export const maxDuration = 60;

function getServiceRoleKey(): string | undefined {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.includes('YOUR_')) return undefined;
  return raw;
}

/**
 * Deletes EXS1001–EXS1042 (and legacy EX26001–15) auth accounts and related rows
 * so students can register again with their own passwords.
 */
export async function POST() {
  try {
    const rdsUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const serviceRoleKey = getServiceRoleKey();

    if (!rdsUrl || !serviceRoleKey || !rdsUrl.includes('.db.co')) {
      return NextResponse.json(
        {
          error:
            'Set NEXT_PUBLIC_APP_URL and AUTH_SECRET (service role) for this deployment.',
        },
        { status: 500 },
      );
    }

    const db = getDbService();

    const result = await resetElevateXSampleStudents(db);

    if (result.errors.length > 0 && result.deletedRolls.length === 0) {
      return NextResponse.json(
        { error: result.errors.join('; '), ...result },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${result.deletedRolls.length} ElevateX demo login(s). Students can sign up again at /auth/signup/student.`,
      expectedDemoCount: ELEVATEX_SAMPLE_COUNT,
      ...result,
      studentSignup: '/auth/signup/student',
      studentLogin: '/auth/login/student',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ElevateX reset failed unexpectedly';
    console.error('[reset-elevatex-sample]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
