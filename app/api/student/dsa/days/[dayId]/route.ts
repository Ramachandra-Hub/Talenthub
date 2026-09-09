import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getDsaDay, completeDsaDay, httpErrorStatus } from '@/lib/dsa/service';
import type { DsaAttemptKind } from '@/lib/dsa/types';
import {
  ensureDsaTables,
  ensureDsaSchemaExtensions,
  isMissingDsaTableError,
} from '@/lib/dsa/ensure-tables';

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
    await ensureDsaTables();
    const data = await getDsaDay(auth.ctx.user.id, dayId, kind);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[dsa/days GET]', err);
    if (isMissingDsaTableError(err)) {
      try {
        await ensureDsaTables();
        await ensureDsaSchemaExtensions();
        const data = await getDsaDay(auth.ctx.user.id, dayId, kind);
        return NextResponse.json(data);
      } catch (retryErr) {
        console.error('[dsa/days GET retry]', retryErr);
        err = retryErr;
      }
    }
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
    await ensureDsaTables();
    const data = await completeDsaDay(auth.ctx.user.id, dayId);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[dsa/days POST]', err);
    if (isMissingDsaTableError(err)) {
      try {
        await ensureDsaTables();
        await ensureDsaSchemaExtensions();
        const data = await completeDsaDay(auth.ctx.user.id, dayId);
        return NextResponse.json(data);
      } catch (retryErr) {
        err = retryErr;
      }
    }
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not complete day' },
      { status: status === 500 ? 500 : status },
    );
  }
}
