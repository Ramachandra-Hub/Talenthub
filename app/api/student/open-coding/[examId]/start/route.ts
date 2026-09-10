import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { startDsaHardOpenChallenge } from '@/lib/exams/dsa-hard-open';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ examId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { examId } = await ctx.params;
  try {
    const data = await startDsaHardOpenChallenge(examId, auth.ctx.user.id);
    return NextResponse.json(data);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start challenge' },
      { status },
    );
  }
}
