import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { fetchElevateXScorecardForAttempt } from '@/lib/placement/fetch-elevatex-scorecard';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const auth = await requireAuth(undefined, _request);
  if ('response' in auth) return auth.response;

  const role = String(auth.ctx.user.user_metadata?.role ?? 'student').toLowerCase();
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Scorecards are available only to admin users.' },
      { status: 403 },
    );
  }

  const { attemptId } = await params;
  const service = getDbService();
  if (!service) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const result = await fetchElevateXScorecardForAttempt(service, attemptId);
  if (!('scorecard' in result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    scorecard: result.scorecard,
    attemptId: result.attemptId,
    userId: result.userId,
  });
}
