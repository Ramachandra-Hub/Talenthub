import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { partitionEvaloraModulesForStudent, type EvaloraModuleScheduleRow } from '@/lib/evalora/module-schedule';
import { partitionSchedulesForStudent, type ExamScheduleRow } from '@/lib/exam-schedule';
import { findStudentSlotAssignment, buildStudentSlotExamPortalNotices } from '@/lib/exam-schedule-slots';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { syncExpiredLiveExamSchedules } from '@/lib/exam-schedule-sync';
import { listLiveFacultyExamsForStudent } from '@/lib/live-faculty-exams';
import { buildStudentPortalPayload } from '@/lib/student-portal';
import { resolveStudentTargeting } from '@/lib/student-profile-sync';
import { requireAuth } from '@/lib/server-auth';

export async function GET() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json(
      buildStudentPortalPayload({
        evaloraLive: [],
        evaloraUpcoming: [],
        facultyLive: [],
        facultyUpcoming: [],
        slotNotices: [],
        department: null,
        year: null,
      }),
    );
  }

  const { data: authUser } = await admin.auth.admin.getUserById(auth.ctx.resolved.id);
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
    auth.ctx.resolved.email,
  );

  const department = profile.branch ?? auth.ctx.resolved.department ?? null;
  const year = profile.academic_year ?? auth.ctx.resolved.academicYear ?? null;

  if (!department || !year) {
    return NextResponse.json(
      buildStudentPortalPayload({
        evaloraLive: [],
        evaloraUpcoming: [],
        facultyLive: [],
        facultyUpcoming: [],
        slotNotices: [],
        department,
        year,
        message: 'Complete your profile (department and year) to see scheduled examinations.',
      }),
    );
  }

  const [{ data: evaloraRows }, { data: scheduleRows }, { data: approvedRequests }] =
    await Promise.all([
      admin
        .from('evalora_module_schedules')
        .select('*')
        .neq('status', 'ended')
        .order('starts_at', { ascending: true }),
      admin
        .from('exam_schedules')
        .select('*')
        .neq('status', 'ended')
        .order('starts_at', { ascending: true }),
      admin
        .from('faculty_exam_requests')
        .select(
          'id, title, topic, description, duration_minutes, target_years, target_branches, published_test_id, department',
        )
        .eq('status', 'approved')
        .not('published_test_id', 'is', null),
    ]);

  let schedules = (scheduleRows ?? []) as ExamScheduleRow[];
  if (schedules.length > 0) {
    schedules = await syncExpiredLiveExamSchedules(admin, schedules);
  }
  const facultyIds = [
    ...new Set(
      schedules
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

  const evalora = partitionEvaloraModulesForStudent(
    (evaloraRows ?? []) as EvaloraModuleScheduleRow[],
    department,
    year,
  );
  const rollNumber = rollNumberFromUser(
    auth.ctx.resolved.email ?? auth.ctx.user.email,
    (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
  );

  const schedulesForPartition: ExamScheduleRow[] = [];
  const requestIds = [
    ...new Set(
      schedules
        .map((s) => s.faculty_exam_request_id)
        .filter(Boolean) as string[],
    ),
  ];
  const slotRequestSet = new Set<string>();
  if (requestIds.length && rollNumber) {
    for (const reqId of requestIds) {
      const { data: req } = await admin
        .from('faculty_exam_requests')
        .select('uses_slot_scheduling')
        .eq('id', reqId)
        .maybeSingle();
      if (req?.uses_slot_scheduling) slotRequestSet.add(reqId);
    }
  }

  for (const schedule of schedules) {
    const reqId = schedule.faculty_exam_request_id;
    if (!reqId || !slotRequestSet.has(reqId)) {
      schedulesForPartition.push(schedule);
      continue;
    }
    const assignment = await findStudentSlotAssignment(admin, reqId, rollNumber);
    if (assignment && schedule.slot_number === assignment.slot_number) {
      schedulesForPartition.push(schedule);
    }
  }

  const faculty = partitionSchedulesForStudent(
    schedulesForPartition,
    department,
    year,
    extras,
  );

  const supplementalLive = listLiveFacultyExamsForStudent(
    (approvedRequests ?? []) as Parameters<typeof listLiveFacultyExamsForStudent>[0],
    schedules,
    department,
    year,
    extras,
  );

  const mergedLiveByTest = new Map<string, (typeof faculty.live)[0]>();
  for (const exam of [...faculty.live, ...supplementalLive]) {
    mergedLiveByTest.set(String(exam.test_id), exam);
  }
  const facultyLive = Array.from(mergedLiveByTest.values());

  const examTitlesByRequestId = new Map<string, string>();
  for (const row of approvedRequests ?? []) {
    examTitlesByRequestId.set(String(row.id), String(row.title));
  }
  for (const schedule of schedules) {
    const reqId = schedule.faculty_exam_request_id;
    if (!reqId || examTitlesByRequestId.has(reqId)) continue;
    const baseTitle = schedule.title.split(' · Slot')[0]?.trim();
    if (baseTitle) examTitlesByRequestId.set(reqId, baseTitle);
  }

  const slotNotices = rollNumber
    ? await buildStudentSlotExamPortalNotices(admin, {
        schedules,
        department,
        year,
        rollNumber,
        examTitlesByRequestId,
      })
    : [];

  return NextResponse.json({
    ...buildStudentPortalPayload({
      evaloraLive: evalora.live,
      evaloraUpcoming: evalora.upcoming,
      facultyLive,
      facultyUpcoming: faculty.upcoming,
      slotNotices,
      department,
      year,
    }),
    studentName: profile.full_name ?? auth.ctx.user.email ?? null,
  });
}
