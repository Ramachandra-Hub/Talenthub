import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { partitionSchedulesForStudent } from '@/lib/exam-schedule';
import type { ExamScheduleRow } from '@/lib/exam-schedule';

export async function GET() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ live: [], upcoming: [], department: null, year: null });
  }

  const { data: profile } = await admin
    .from('users')
    .select('branch, academic_year')
    .eq('id', auth.ctx.resolved.id)
    .maybeSingle();

  const prof = profile as { branch?: string; academic_year?: string } | null;
  const department = prof?.branch ?? auth.ctx.resolved.department ?? null;
  const year = prof?.academic_year ?? auth.ctx.resolved.academicYear ?? null;

  if (!department || !year) {
    return NextResponse.json({
      live: [],
      upcoming: [],
      department,
      year,
      message: 'Complete your profile (department and year) to see live and upcoming tests.',
    });
  }

  const { data: schedules, error } = await admin
    .from('exam_schedules')
    .select('*')
    .neq('status', 'ended')
    .order('starts_at', { ascending: true });

  if (error) {
    return NextResponse.json({ live: [], upcoming: [], department, year });
  }

  const facultyIds = [
    ...new Set(
      (schedules ?? [])
        .map((s) => s.faculty_exam_request_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  const extras = new Map<string, { duration_minutes?: number; topic?: string | null }>();
  if (facultyIds.length) {
    const { data: facultyRows } = await admin
      .from('faculty_exam_requests')
      .select('id, duration_minutes, topic')
      .in('id', facultyIds);
    for (const row of facultyRows ?? []) {
      extras.set(row.id as string, {
        duration_minutes: row.duration_minutes as number,
        topic: (row.topic as string | null) ?? null,
      });
    }
  }

  const { live, upcoming } = partitionSchedulesForStudent(
    (schedules ?? []) as ExamScheduleRow[],
    department,
    year,
    extras,
  );

  return NextResponse.json({ live, upcoming, department, year });
}
