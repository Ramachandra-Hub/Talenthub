import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { signOut } from '@/auth';
import { requireAuth } from '@/lib/server-auth';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';

export async function POST() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  await releaseStudentSessionPrisma(auth.ctx.user.id);
  await signOut({ redirect: false });
  return NextResponse.json({ success: true });
}
