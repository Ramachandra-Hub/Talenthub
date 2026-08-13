import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import {
  clearStudentSessionCookieHeader,
  readStudentSessionIdFromRequest,
} from '@/lib/student-session-cookie';

export const dynamic = 'force-dynamic';

/** Clear active-session heartbeat after exam submit or leaving the take page. */
export async function POST(request: Request) {
  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id || user.role !== 'student') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sessionId = readStudentSessionIdFromRequest(request);

  try {
    await releaseStudentSessionPrisma(user.id, sessionId);
    const res = NextResponse.json({ ok: true });
    res.headers.append('Set-Cookie', clearStudentSessionCookieHeader());
    return res;
  } catch (err) {
    console.error('[session-release]', err);
    return NextResponse.json(
      { ok: false, error: 'Could not release session lock.' },
      { status: 503 },
    );
  }
}
