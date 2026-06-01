import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { findCompletedElevateXAttempt } from '@/lib/test-attempts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(undefined, request);
  if ('response' in auth) return auth.response;

  const service = getDbService();
  if (!service) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const prior = await findCompletedElevateXAttempt(service, auth.ctx.user.id);
  if (!prior) {
    return NextResponse.json({ completed: false });
  }

  return NextResponse.json({
    completed: true,
    attemptId: prior.id,
    score: prior.score,
    completedAt: prior.completed_at,
  });
}
