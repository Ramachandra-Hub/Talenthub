import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import {
  ELEVATEX_SAMPLE_COUNT,
  ELEVATEX_SAMPLE_STUDENTS,
} from '@/lib/elevatex-sample-credentials';
import { resetElevateXSampleAttempts } from '@/lib/elevatex-sample-seed';
import { assertSetupDeploymentReady } from '@/lib/setup/deployment-ready';

export const maxDuration = 120;

/** Clears ElevateX attempts for EXS1001–EXS1120 so they can retake (logins unchanged). */
export async function POST() {
  try {
    const ready = assertSetupDeploymentReady();
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error }, { status: 500 });
    }

    const db = getDbService();
    if (!db) {
      return NextResponse.json({ error: 'Database client not configured' }, { status: 500 });
    }

    const result = await resetElevateXSampleAttempts(db);

    if (result.errors.length > 0 && result.attemptsDeleted === 0 && result.studentsFound === 0) {
      return NextResponse.json({ error: result.errors.join('; '), ...result }, { status: 500 });
    }

    const firstRoll = ELEVATEX_SAMPLE_STUDENTS[0]?.roll ?? 'EXS1001';
    const lastRoll =
      ELEVATEX_SAMPLE_STUDENTS[ELEVATEX_SAMPLE_STUDENTS.length - 1]?.roll ?? 'EXS1120';

    return NextResponse.json({
      success: true,
      message: `Cleared ElevateX attempts for ${result.studentsFound} demo student(s). They can log in with ${firstRoll}–${lastRoll} and take the exam again.`,
      expectedDemoCount: ELEVATEX_SAMPLE_COUNT,
      ...result,
      studentLogin: '/auth/login/student',
      assessment: '/placement/assessment',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ElevateX attempt reset failed';
    console.error('[reset-elevatex-attempts]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
