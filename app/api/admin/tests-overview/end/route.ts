import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { endOpenLinkExamByOverviewId } from '@/lib/admin/end-open-link-exam';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  let body: { overviewId?: string };
  try {
    body = (await request.json()) as { overviewId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const overviewId = String(body.overviewId ?? '').trim();
  if (!overviewId) {
    return NextResponse.json({ error: 'overviewId is required' }, { status: 400 });
  }

  const result = await endOpenLinkExamByOverviewId(overviewId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    examId: result.examId,
    title: result.title,
  });
}
