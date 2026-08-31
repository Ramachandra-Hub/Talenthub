import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { submitDsaMcq, httpErrorStatus } from '@/lib/dsa/service';

export async function POST(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const data = await submitDsaMcq({
      userId: auth.ctx.user.id,
      mcqId: String(body.mcqId ?? ''),
      selected: String(body.selected ?? ''),
    });
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not save MCQ' },
      { status: status === 500 ? 500 : status },
    );
  }
}
