import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';

export const dynamic = 'force-dynamic';

/** Clear active-session heartbeat after exam submit or leaving the take page. */
export async function POST() {
  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id || user.role !== 'student') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await releaseStudentSessionPrisma(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[session-release]', err);
    return NextResponse.json({ ok: true, warning: 'release_unavailable' });
  }
}
