import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getDsaDashboard, httpErrorStatus } from '@/lib/dsa/service';
import { ensureDsaTables, isMissingDsaTableError } from '@/lib/dsa/ensure-tables';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  try {
    await ensureDsaTables();
    const data = await getDsaDashboard(auth.ctx.user.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[dsa/dashboard]', err);
    if (isMissingDsaTableError(err)) {
      try {
        await ensureDsaTables();
        const data = await getDsaDashboard(auth.ctx.user.id);
        return NextResponse.json(data);
      } catch (retryErr) {
        console.error('[dsa/dashboard retry]', retryErr);
        err = retryErr;
      }
    }
    const status = httpErrorStatus(err);
    const message = err instanceof Error ? err.message : 'Could not load DSA portal';
    return NextResponse.json({ error: message }, { status: status === 500 ? 500 : status });
  }
}
