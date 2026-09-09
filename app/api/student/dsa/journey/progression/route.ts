import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getArenaProgressionForStudent } from '@/lib/dsa/arena-progression';
import { httpErrorStatus } from '@/lib/dsa/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Batched Arena progression for the authenticated student.
 * Read-only: does not grade, complete days, or invent mission_progress rows.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  try {
    const snapshot = await getArenaProgressionForStudent(auth.ctx.user.id);
    return NextResponse.json(snapshot);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load Arena progression' },
      { status: status === 500 ? 500 : status },
    );
  }
}
