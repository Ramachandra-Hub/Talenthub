import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { resolveJourneyMissionForStudent } from '@/lib/dsa/journey-missions';
import { httpErrorStatus } from '@/lib/dsa/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ missionKey: string }> };

/**
 * Thin journey mapping lookup. Does not grade, assign, or complete days.
 */
export async function GET(request: Request, context: Ctx) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const { missionKey: raw } = await context.params;
  const missionKey = decodeURIComponent(raw ?? '').trim();
  if (!missionKey) {
    return NextResponse.json({ error: 'missionKey is required' }, { status: 400 });
  }

  try {
    const target = await resolveJourneyMissionForStudent(auth.ctx.user.id, missionKey);
    return NextResponse.json(target);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not resolve mission' },
      { status: status === 500 ? 500 : status },
    );
  }
}
