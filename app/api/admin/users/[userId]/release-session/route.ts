import { NextResponse } from 'next/server';
import { adminReleaseStudentPortalSession } from '@/lib/admin/student-portal-session-admin';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { userId } = await context.params;
  const id = userId?.trim();
  if (!id) {
    return NextResponse.json({ error: 'User id required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      rollNumber: true,
      userRole: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (user.userRole === 'faculty') {
    return NextResponse.json({ error: 'Faculty accounts do not use portal session locks.' }, { status: 400 });
  }

  const adminRow = await prisma.adminUser.findUnique({
    where: { userId: id },
    select: { userId: true },
  });
  if (adminRow) {
    return NextResponse.json({ error: 'Cannot release session for an admin account.' }, { status: 400 });
  }

  const result = await adminReleaseStudentPortalSession(id);
  const label = user.rollNumber?.trim() || user.fullName?.trim() || user.email;

  return NextResponse.json({
    ok: true,
    released: result.released,
    had_active_session: result.hadActiveSession,
    message: result.hadActiveSession
      ? `Portal login released for ${label}. The student can sign in again.`
      : `No active portal session for ${label}. They can sign in normally.`,
  });
}
