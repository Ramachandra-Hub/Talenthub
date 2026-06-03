import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  backfillElevateXScorecardToAttemptPrisma,
  findElevateXScorecardByRoll,
} from '@/lib/placement/elevatex-scorecard-recovery';
import { fetchElevateXScorecardForAttemptPrisma } from '@/lib/placement/fetch-elevatex-scorecard-prisma';

export const dynamic = 'force-dynamic';

/** GET ?roll=EXS1001 or ?attemptId=uuid — locate a stored scorecard. */
export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get('attemptId')?.trim() ?? '';
  const roll = searchParams.get('roll')?.trim() ?? '';

  if (roll) {
    const hit = await findElevateXScorecardByRoll(roll);
    if (!hit) {
      return NextResponse.json(
        { found: false, error: `No scorecard in database for roll ${roll}.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ found: true, ...hit });
  }

  if (attemptId) {
    const result = await fetchElevateXScorecardForAttemptPrisma(attemptId, { rollNumber: roll });
    if (!('scorecard' in result)) {
      return NextResponse.json({ found: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ found: true, ...result });
  }

  return NextResponse.json(
    { error: 'Provide query ?roll=EXS1001 or ?attemptId=<uuid>' },
    { status: 400 },
  );
}

/** POST { attemptId } — copy scorecard from another row/stats onto this attempt. */
export async function POST(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  let body: { attemptId?: string };
  try {
    body = (await request.json()) as { attemptId?: string };
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const attemptId = String(body.attemptId ?? '').trim();
  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });
  }

  const result = await backfillElevateXScorecardToAttemptPrisma(attemptId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }

  const loaded = await fetchElevateXScorecardForAttemptPrisma(attemptId);
  return NextResponse.json({
    ok: true,
    ...result,
    scorecard: 'scorecard' in loaded ? loaded.scorecard : null,
  });
}
