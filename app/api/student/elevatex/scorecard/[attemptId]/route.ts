import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { attachElevateXScorecardToAttemptPrisma } from '@/lib/placement/elevatex-scorecard-recovery';
import { parseElevateXScorecardFromAnswers } from '@/lib/placement/scorecard-payload';
import { isUuidAttemptId } from '@/lib/db/resolve-test-id-for-insert';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST — student saves ElevateX scorecard after submit (section-wise admin report). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const { attemptId } = await params;
  if (!isUuidAttemptId(attemptId)) {
    return NextResponse.json({ error: 'Invalid attempt id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const answers =
    body.answers != null && typeof body.answers === 'object'
      ? (body.answers as Record<string, unknown>)
      : body.scorecard != null && typeof body.scorecard === 'object'
        ? ({
            _type: 'elevatex_scorecard_v1',
            scorecard: body.scorecard,
          } as Record<string, unknown>)
        : null;

  if (!answers || !parseElevateXScorecardFromAnswers(answers)) {
    return NextResponse.json({ error: 'scorecard or answers payload required' }, { status: 400 });
  }

  const ok = await attachElevateXScorecardToAttemptPrisma(
    auth.ctx.user.id,
    attemptId,
    answers,
  );
  if (!ok) {
    return NextResponse.json({ error: 'Could not attach scorecard to attempt' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, attemptId });
}
