import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { loadStudentSlotAssignmentsByRoll } from '@/lib/student-portal-exams';
import {
  ensureStudentProfileRow,
  resolveStudentTargeting,
} from '@/lib/student-profile-sync';
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
  const authMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    authMeta,
    auth.ctx.resolved.email,
  );

  let branch = profile.branch;
  let year = profile.academic_year;
  const rollNumber = rollNumberFromUser(auth.ctx.resolved.email ?? '', authMeta);
  if (rollNumber && (!branch || !year)) {
    const assignments = await loadStudentSlotAssignmentsByRoll(admin, rollNumber);
    for (const row of assignments.values()) {
      if (!branch && row.branch?.trim()) branch = row.branch.trim();
      if (!year && row.year?.trim()) year = row.year.trim();
    }
    if (branch || year) {
      await ensureStudentProfileRow(admin, auth.ctx.resolved.id, {
        ...profile,
        branch: branch ?? profile.branch,
        academic_year: year ?? profile.academic_year,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    branch: branch ?? profile.branch,
    academic_year: year ?? profile.academic_year,
    full_name: profile.full_name,
  });
}
