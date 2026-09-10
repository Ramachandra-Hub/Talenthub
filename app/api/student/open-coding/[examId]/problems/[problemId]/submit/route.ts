import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { submitDsaHardOpenCode } from '@/lib/exams/dsa-hard-open';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ examId: string; problemId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { examId, problemId } = await ctx.params;
  try {
    let body: { language?: string; sourceCode?: string } = {};
    try {
      body = (await request.json()) as { language?: string; sourceCode?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!String(body.sourceCode ?? '').trim()) {
      return NextResponse.json(
        { error: 'Source code is empty. Type your solution before submitting.' },
        { status: 400 },
      );
    }
    const result = await submitDsaHardOpenCode({
      examId,
      userId: auth.ctx.user.id,
      problemId,
      language: body.language ?? '',
      sourceCode: body.sourceCode ?? '',
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    console.error('[open-coding/submit]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Submit failed' },
      { status },
    );
  }
}
