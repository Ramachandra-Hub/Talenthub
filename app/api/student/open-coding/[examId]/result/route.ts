import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  finalizeDsaHardOpenAttempt,
  getDsaHardOpenResult,
} from '@/lib/exams/dsa-hard-open';
import { clearOpenCodingLockCookieHeader } from '@/lib/exams/open-coding-lock';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ examId: string }> };

function withLockCleared(data: unknown, status = 200) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.append('Set-Cookie', clearOpenCodingLockCookieHeader());
  return new NextResponse(JSON.stringify(data), { status, headers });
}

/** Student GET — confirm submitted; never return the scorecard payload. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { examId } = await ctx.params;
  try {
    await getDsaHardOpenResult(examId, auth.ctx.user.id);
    return withLockCleared({
      submitted: true,
      message: 'Exam submitted. Results are available to administrators only.',
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load result' },
      { status },
    );
  }
}

/** Student POST — finalize attempt; do not return scorecard to the client. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { examId } = await ctx.params;
  try {
    await finalizeDsaHardOpenAttempt(examId, auth.ctx.user.id);
    return withLockCleared({
      submitted: true,
      message: 'Exam submitted. Results are available to administrators only.',
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to finalize attempt' },
      { status },
    );
  }
}
