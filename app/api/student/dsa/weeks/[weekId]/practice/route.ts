import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { startPracticeWeek, httpErrorStatus } from '@/lib/dsa/service';

type Ctx = { params: Promise<{ weekId: string }> };

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { weekId } = await context.params;
  try {
    const data = await startPracticeWeek(auth.ctx.user.id, weekId);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start practice' },
      { status: status === 500 ? 500 : status },
    );
  }
}
