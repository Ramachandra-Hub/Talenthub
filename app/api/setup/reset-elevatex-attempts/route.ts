import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { resetElevateXSampleAttempts } from '@/lib/elevatex-sample-seed';
import { ELEVATEX_SAMPLE_COUNT } from '@/lib/elevatex-sample-credentials';

export const maxDuration = 60;

function getServiceRoleKey(): string | undefined {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.includes('YOUR_')) return undefined;
  return raw;
}

/** Clears ElevateX attempts for EXS1001–EXS1042 so they can retake (logins unchanged). */
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

    const result = await resetElevateXSampleAttempts(db);

    if (result.errors.length > 0 && result.attemptsDeleted === 0 && result.studentsFound === 0) {
      return NextResponse.json({ error: result.errors.join('; '), ...result }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ElevateX attempts for ${result.studentsFound} demo student(s). They can log in with EXS1001–EXS1042 and take the exam again.`,
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
