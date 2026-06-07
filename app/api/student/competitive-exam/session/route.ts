import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  getOrCreateCompetitiveSeedPrisma,
  resolveCompetitiveSeedFromAttempt,
} from '@/lib/db/competitive-exam-prisma';

export const dynamic = 'force-dynamic';

/** GET — resume server-bound competitive exam seed for the logged-in student. */
export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const seed = await resolveCompetitiveSeedFromAttempt(auth.ctx.user.id);
  if (!seed) {
    return NextResponse.json({ error: 'No active competitive exam session.' }, { status: 404 });
  }
  return NextResponse.json({ seed });
}

/** POST — create or return existing competitive exam seed (server-bound). */
export async function POST(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const result = await getOrCreateCompetitiveSeedPrisma(auth.ctx.user.id);
  return NextResponse.json(result);
}
