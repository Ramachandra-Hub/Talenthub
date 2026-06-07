import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { touchStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import { readStudentSessionIdFromRequest } from '@/lib/student-session-cookie';

export const dynamic = 'force-dynamic';

/** Keep student session lock alive; no-op for guests and admins. */
export async function POST(request: Request) {
  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id || user.role === 'admin') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (user.role !== 'student') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sessionId = readStudentSessionIdFromRequest(request) ?? user.id;

  try {
    await touchStudentSessionPrisma(user.id, sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[session-heartbeat]', err);
    return NextResponse.json(
      { ok: false, error: 'Session heartbeat failed. Your login may expire.' },
      { status: 503 },
    );
  }
}
