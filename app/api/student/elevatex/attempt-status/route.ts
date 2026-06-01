import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { findCompletedElevateXAttemptForUser } from '@/lib/elevatex/completed-attempt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prior = await findCompletedElevateXAttemptForUser(session.user.id);
    if (!prior) {
      return NextResponse.json({ completed: false });
    }

    return NextResponse.json({
      completed: true,
      attemptId: prior.id,
      score: prior.score,
      completedAt: prior.completed_at,
    });
  } catch (err) {
    console.error('[elevatex/attempt-status]', err);
    return NextResponse.json({ completed: false });
  }
}
