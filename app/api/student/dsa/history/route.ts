import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getDsaHistory, httpErrorStatus } from '@/lib/dsa/service';

export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  try {
    const data = await getDsaHistory(auth.ctx.user.id);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load history' },
      { status: status === 500 ? 500 : status },
    );
  }
}
