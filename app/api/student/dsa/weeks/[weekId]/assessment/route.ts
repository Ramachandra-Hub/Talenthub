import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  getWeeklyAssessmentPaper,
  submitWeeklyAssessment,
  httpErrorStatus,
} from '@/lib/dsa/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ weekId: string }> };

export async function GET(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { weekId } = await context.params;
  try {
    const data = await getWeeklyAssessmentPaper(auth.ctx.user.id, weekId);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load assessment' },
      { status: status === 500 ? 500 : status },
    );
  }
}

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { weekId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const answersRaw = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answersRaw as Record<string, unknown>)) {
    answers[k] = String(v ?? '');
  }
  try {
    const data = await submitWeeklyAssessment({
      userId: auth.ctx.user.id,
      weekId,
      answers,
    });
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not submit assessment' },
      { status: status === 500 ? 500 : status },
    );
  }
}
