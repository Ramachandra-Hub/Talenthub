import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { submitContestCode } from '@/lib/dsa/contest/service';
import { httpErrorStatus } from '@/lib/dsa/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ contestId: string; problemId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { contestId, problemId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const data = await submitContestCode({
      userId: auth.ctx.user.id,
      contestIdOrSlug: contestId,
      problemId,
      language: String(body.language ?? ''),
      sourceCode: String(body.sourceCode ?? ''),
    });
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Submit failed' },
      { status },
    );
  }
}
