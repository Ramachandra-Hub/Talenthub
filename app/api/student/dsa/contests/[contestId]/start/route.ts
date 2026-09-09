import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { startContestAttempt } from '@/lib/dsa/contest/service';
import { httpErrorStatus } from '@/lib/dsa/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ contestId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { contestId } = await ctx.params;
  try {
    const data = await startContestAttempt(auth.ctx.user.id, contestId);
    return NextResponse.json({
      contestId: data.contestId,
      attemptId: data.attempt.id,
      status: data.attempt.status,
      resumed: data.resumed,
      completed: data.completed,
    });
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start contest' },
      { status },
    );
  }
}
