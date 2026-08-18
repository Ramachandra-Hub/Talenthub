import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { fetchElevateXScorecardForAttemptPrisma } from '@/lib/placement/fetch-elevatex-scorecard-prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { attemptId } = await params;
  const rollNumber = new URL(request.url).searchParams.get('roll')?.trim() || undefined;
  const result = await fetchElevateXScorecardForAttemptPrisma(attemptId, { rollNumber });

  if (!('scorecard' in result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    scorecard: result.scorecard,
    attemptId: result.attemptId,
    userId: result.userId,
  });
}
