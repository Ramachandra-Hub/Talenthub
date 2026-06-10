import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { partitionEvaloraModulesForStudent, type EvaloraModuleScheduleRow } from '@/lib/evalora/module-schedule';
import { partitionSchedulesForStudent, type ExamScheduleRow } from '@/lib/exam-schedule';
import {
  buildStudentSlotExamPortalNotices,
  scheduleSlotNumber,
  facultyRequestUsesSlotScheduling,
} from '@/lib/exam-schedule-slots';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { syncExpiredLiveExamSchedules } from '@/lib/exam-schedule-sync';
import { listLiveFacultyExamsForStudent } from '@/lib/live-faculty-exams';
import { buildStudentPortalPayload } from '@/lib/student-portal';
import { resolveStudentTargeting } from '@/lib/student-profile-sync';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import {
  buildRosterFirstStudentExams,
  dedupeFacultyExamSchedules,
  filterEvaloraCoveredByFaculty,
  inferProfileFromRosterAssignments,
  loadStudentSlotAssignmentsByRoll,
  type ApprovedExamRequest,
} from '@/lib/student-portal-exams';

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
  const authMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    authMeta,
    auth.ctx.resolved.email,
  );

  let rollNumber = rollNumberFromUser(
    auth.ctx.resolved.email ?? auth.ctx.user.email ?? '',
    authMeta,
  );
  if (!rollNumber) {
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.ctx.resolved.id },
      select: { rollNumber: true },
    });
    if (dbUser?.rollNumber) rollNumber = normalizeRoll(dbUser.rollNumber);
  }

  const rosterAssignments = rollNumber
    ? await loadStudentSlotAssignmentsByRoll(admin, rollNumber)
    : new Map();

  if (rosterAssignments.size === 0) {
    if (!rollNumber) {
      return NextResponse.json(
        buildStudentPortalPayload({
          evaloraLive: [],
          evaloraUpcoming: [],
          facultyLive: [],
          facultyUpcoming: [],
          slotNotices: [],
          department: profile.branch,
          year: profile.academic_year,
          message: 'Sign in with your roll number to see scheduled examinations.',
        }),
      );
    }
    if (!profile.branch || !profile.academic_year) {
      return NextResponse.json(
        buildStudentPortalPayload({
          evaloraLive: [],
          evaloraUpcoming: [],
          facultyLive: [],
          facultyUpcoming: [],
          slotNotices: [],
          department: profile.branch,
          year: profile.academic_year,
          message:
            'Complete your profile (department and year) to see scheduled examinations.',
        }),
      );
    }
  }

  const inferred = inferProfileFromRosterAssignments(
    rosterAssignments,
    profile.branch ?? auth.ctx.resolved.department ?? null,
    profile.academic_year ?? auth.ctx.resolved.academicYear ?? null,
  );

  const department =
    profile.branch?.trim() ||
    auth.ctx.resolved.department?.trim() ||
    inferred.department;
  const year =
    profile.academic_year?.trim() ||
    auth.ctx.resolved.academicYear?.trim() ||
    inferred.year;

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
          'id, title, topic, description, duration_minutes, target_years, target_branches, published_test_id, department, schedule_slots_json, uses_slot_scheduling',
        )
        .eq('status', 'approved')
        .not('published_test_id', 'is', null),
    ]);

  let schedules = (scheduleRows ?? []) as ExamScheduleRow[];
  if (schedules.length > 0) {
    schedules = await syncExpiredLiveExamSchedules(admin, schedules);
  }

  const approved = (approvedRequests ?? []) as ApprovedExamRequest[];
  const publishedRequestIds = new Set(approved.map((r) => String(r.id)));
  schedules = schedules.filter((s) => {
    const reqId = s.faculty_exam_request_id;
    if (!reqId) return false;
    return publishedRequestIds.has(String(reqId));
  });

  const facultyIds = [
    ...new Set(
      schedules
        .map((s) => s.faculty_exam_request_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  const extras = new Map<string, { duration_minutes?: number; topic?: string | null }>();
  for (const row of approved) {
    extras.set(String(row.id), {
      duration_minutes: row.duration_minutes as number,
      topic: (row.topic as string | null) ?? null,
    });
  }
  if (facultyIds.length) {
    const missing = facultyIds.filter((id) => !extras.has(id));
    if (missing.length) {
      const { data: facultyRows } = await admin
        .from('faculty_exam_requests')
        .select('id, duration_minutes, topic')
        .in('id', missing);
      for (const row of facultyRows ?? []) {
        extras.set(row.id as string, {
          duration_minutes: row.duration_minutes as number,
          topic: (row.topic as string | null) ?? null,
        });
      }
    }
  }

  let evalora = partitionEvaloraModulesForStudent(
    (evaloraRows ?? []) as EvaloraModuleScheduleRow[],
    department,
    year,
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
  const studentSlotByRequestId = new Map<string, number>();

  for (const [reqId, assignment] of rosterAssignments) {
    studentSlotByRequestId.set(reqId, assignment.slot_number);
    slotRequestSet.add(reqId);
  }

  if (requestIds.length && rollNumber) {
    for (const reqId of requestIds) {
      if (studentSlotByRequestId.has(reqId)) continue;
      const related = schedules.filter((s) => s.faculty_exam_request_id === reqId);
      const usesSlots = await facultyRequestUsesSlotScheduling(admin, reqId, related);
      if (!usesSlots) continue;
      slotRequestSet.add(reqId);
      const fromMap = rosterAssignments.get(reqId);
      if (fromMap) studentSlotByRequestId.set(reqId, fromMap.slot_number);
    }
  }

  for (const schedule of schedules) {
    const reqId = schedule.faculty_exam_request_id;
    if (!reqId || !slotRequestSet.has(reqId)) {
      schedulesForPartition.push(schedule);
      continue;
    }
    const assignedSlot = studentSlotByRequestId.get(reqId);
    if (assignedSlot == null) continue;
    if (scheduleSlotNumber(schedule) === assignedSlot) {
      schedulesForPartition.push(schedule);
    } else if (
      schedule.title.toLowerCase().includes(`slot ${assignedSlot}`)
    ) {
      schedulesForPartition.push(schedule);
    }
  }

  const rosterAssignedRequestIds = new Set(studentSlotByRequestId.keys());

  const examTitlesByRequestId = new Map<string, string>();
  for (const row of approved) {
    examTitlesByRequestId.set(String(row.id), String(row.title));
  }
  for (const schedule of schedules) {
    const reqId = schedule.faculty_exam_request_id;
    if (!reqId || examTitlesByRequestId.has(reqId)) continue;
    const baseTitle = schedule.title.split(' · Slot')[0]?.trim();
    if (baseTitle) examTitlesByRequestId.set(reqId, baseTitle);
  }

  const faculty = partitionSchedulesForStudent(
    schedulesForPartition,
    department,
    year,
    extras,
    rosterAssignedRequestIds,
  );

  const rosterExams = rollNumber
    ? await buildRosterFirstStudentExams({
        admin,
        rollNumber,
        schedules,
        approvedRequests: approved,
        department,
        year,
        extras,
      })
    : {
        facultyLive: [],
        facultyUpcoming: [],
        evaloraLive: [],
        evaloraUpcoming: [],
      };

  const slotFilter =
    studentSlotByRequestId.size > 0 ? studentSlotByRequestId : undefined;

  const supplementalLive = listLiveFacultyExamsForStudent(
    approved as Parameters<typeof listLiveFacultyExamsForStudent>[0],
    schedules,
    department,
    year,
    extras,
    slotFilter,
  );

  const facultyLive = dedupeFacultyExamSchedules(
    [...rosterExams.facultyLive, ...faculty.live, ...supplementalLive],
    slotFilter,
  ).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const facultyUpcoming = dedupeFacultyExamSchedules(
    [...rosterExams.facultyUpcoming, ...faculty.upcoming],
    slotFilter,
  ).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const facultyForEvaloraFilter = [...facultyLive, ...facultyUpcoming];
  evalora.live = filterEvaloraCoveredByFaculty(evalora.live, facultyForEvaloraFilter);
  evalora.upcoming = filterEvaloraCoveredByFaculty(evalora.upcoming, facultyForEvaloraFilter);

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
      facultyUpcoming,
      slotNotices,
      department,
      year,
    }),
    studentName: profile.full_name ?? auth.ctx.user.email ?? null,
  });
}
