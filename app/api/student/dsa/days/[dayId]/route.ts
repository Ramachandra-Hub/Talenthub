import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getDsaDay, completeDsaDay, httpErrorStatus } from '@/lib/dsa/service';
import type { DsaAttemptKind } from '@/lib/dsa/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ dayId: string }> };

export async function GET(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { dayId } = await context.params;
  const kind: DsaAttemptKind =
    new URL(request.url).searchParams.get('kind') === 'practice' ? 'practice' : 'official';
  try {
    const data = await getDsaDay(auth.ctx.user.id, dayId, kind);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load day' },
      { status: status === 500 ? 500 : status },
    );
  }
}

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const { dayId } = await context.params;
  try {
    const data = await completeDsaDay(auth.ctx.user.id, dayId);
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not complete day' },
      { status: status === 500 ? 500 : status },
    );
  }
}
