import { NextRequest, NextResponse } from 'next/server';
import { ensureLiveExamDb, probeLiveExamDb } from '@/lib/ensure-live-exam-db';
import { postgresUrlSetupHint, rdsSqlEditorUrl } from '@/lib/postgres-url';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';

/** Bootstrap tables for live leaderboard, attempts, and proctoring. */
export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  const before = await probeLiveExamDb();
  const result = await ensureLiveExamDb();

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? 'Bootstrap failed',
        missingBefore: before.missing,
        hint: postgresUrlSetupHint(),
        sqlEditorUrl: rdsSqlEditorUrl(),
      },
      { status: result.error?.includes('not configured') ? 400 : 500 },
    );
  }

  const after = await probeLiveExamDb();
  return NextResponse.json({
    success: true,
    message: 'Live exam database is ready.',
    missingBefore: before.missing,
    missingAfter: after.missing,
  });
}

export async function GET(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  const status = await probeLiveExamDb();
  return NextResponse.json(status);
}
