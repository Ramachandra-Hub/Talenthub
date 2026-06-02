import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { touchStudentSessionPrisma } from '@/lib/student-session-lock-prisma';

export const dynamic = 'force-dynamic';

/** Keep student session lock alive; no-op for guests and admins. */
export async function POST() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.role === 'admin') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const email = user.email ?? '';
  if (!email.includes('@student.')) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sessionId = `${user.id}`;
  await touchStudentSessionPrisma(user.id, sessionId);

  return NextResponse.json({ ok: true });
}
