import { NextRequest, NextResponse } from 'next/server';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';
import { getDbService } from '@/lib/db/get-db-service';
import { resetElevateXSampleStudents } from '@/lib/elevatex-sample-seed';
import { ELEVATEX_SAMPLE_COUNT } from '@/lib/elevatex-sample-credentials';
import { assertSetupDeploymentReady } from '@/lib/setup/deployment-ready';

export const maxDuration = 120;

/**
 * Deletes EXS1001–EXS1120 (and legacy EX26001–15) auth accounts and related rows
 * so students can register again with their own passwords.
 */
export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  try {
    const ready = assertSetupDeploymentReady();
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error }, { status: 500 });
    }

    const db = getDbService();
    if (!db) {
      return NextResponse.json({ error: 'Database client not configured' }, { status: 500 });
    }

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
