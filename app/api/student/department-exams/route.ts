import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { academicYearInList } from '@/lib/academic-year-match';
import { examMatchesDepartment } from '@/lib/department-match';
import { isFacultyExamLiveForStudent } from '@/lib/exam-schedule';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { resolveStudentTargeting } from '@/lib/student-profile-sync';
import { requireAuth } from '@/lib/server-auth';

export async function GET() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ exams: [] });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(auth.ctx.resolved.id);
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
    auth.ctx.resolved.email,
  );

  const department = profile.branch ?? auth.ctx.resolved.department;
  const year = profile.academic_year ?? auth.ctx.resolved.academicYear;

  if (!department || !year) {
    return NextResponse.json({
      exams: [],
      message: 'Complete your profile (department and year)',
    });
  }

  // Approved exams whose primary department matches OR whose target_branches
  // include the student's branch — both filtered to the student's year.
  const { data: requests } = await admin
    .from('faculty_exam_requests')
    .select(
      'id, title, topic, description, duration_minutes, target_years, target_branches, published_test_id, department, created_at',
    )
    .eq('status', 'approved')
    .not('published_test_id', 'is', null);

  const { data: scheduleRows } = await admin.from('exam_schedules').select('*');
  const schedules = (scheduleRows ?? []) as ExamScheduleRow[];

  const exams = (requests ?? []).filter((r) => {
    const years = (r.target_years as string[]) ?? [];
    if (!academicYearInList(year, years)) return false;
    if (!examMatchesDepartment(r, department)) return false;
    return isFacultyExamLiveForStudent(r.id as string, schedules, department, year);
  });

  return NextResponse.json({ exams, department, year });
}
