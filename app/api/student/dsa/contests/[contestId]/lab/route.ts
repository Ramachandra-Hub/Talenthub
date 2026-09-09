import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getContestLabPayload } from '@/lib/dsa/contest/service';
import { httpErrorStatus } from '@/lib/dsa/service';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ contestId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { contestId } = await ctx.params;
  try {
    const data = await getContestLabPayload(auth.ctx.user.id, contestId);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load contest lab' },
      { status },
    );
  }
}
