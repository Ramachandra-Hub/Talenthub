import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { resolveStudentTargeting } from '@/lib/student-profile-sync';
import { requireAuth } from '@/lib/server-auth';

/** Backfill public.users from auth metadata (fixes legacy registrations). */
export async function POST() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(auth.ctx.resolved.id);
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
    auth.ctx.resolved.email,
  );

  return NextResponse.json({
    ok: true,
    branch: profile.branch,
    academic_year: profile.academic_year,
    full_name: profile.full_name,
  });
}
