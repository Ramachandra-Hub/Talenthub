import { prisma } from '@/lib/prisma';
import { isSchedulePastEnd } from '@/lib/exam-schedule-sync';
import {
  isScheduleWindowOpen,
  partitionSchedulesForStudent,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { listLiveFacultyExamsForStudent } from '@/lib/live-faculty-exams';
import { buildStudentPortalPayload } from '@/lib/student-portal';
import { dedupeFacultyExamSchedules } from '@/lib/student-portal-exams';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { resolveStudentProfilePrisma } from '@/lib/db/test-attempts-prisma';
import { sanitizeStudentExamTopic } from '@/lib/placement/elevatex-exam-config';
import {
  getOpenLinkRequestVisibility,
  studentMaySeeOpenLinkExam,
} from '@/lib/exams/open-exam-link';

function mapSchedule(row: {
  id: string;
  testId: string | null;
  facultyExamRequestId?: string | null;
  title: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetDepartments: unknown;
  targetYears: unknown;
  slotNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
}): ExamScheduleRow {
  const nowIso = new Date().toISOString();
  return {
    id: row.id,
    title: row.title ?? 'Exam',
    description: null,
    notice: null,
    faculty_exam_request_id: row.facultyExamRequestId ?? null,
    test_id: row.testId ?? '',
    status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
    starts_at: row.startsAt?.toISOString() ?? nowIso,
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: Array.isArray(row.targetDepartments) ? (row.targetDepartments as string[]) : [],
    target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
    slot_number: row.slotNumber,
    slot_capacity: null,
    created_by: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function syncExpiredLiveExamSchedulesPrisma(
  schedules: ExamScheduleRow[],
  now = Date.now(),
): Promise<ExamScheduleRow[]> {
  const expired = schedules.filter((s) => s.status === 'live' && isSchedulePastEnd(s, now));
  if (!expired.length) return schedules;

  const ids = expired.map((s) => s.id);
  await prisma.examSchedule.updateMany({
    where: { id: { in: ids } },
    data: { status: 'ended' },
  });

  const endedIds = new Set(ids);
  return schedules.map((s) => (endedIds.has(s.id) ? { ...s, status: 'ended' as const } : s));
}

/** Student exam portal payload from RDS (Vercel + Prisma trial path). */
export async function buildStudentPortalFromPrisma(userId: string, email: string | undefined) {
  const profile = await resolveStudentProfilePrisma(userId);
  const department = profile.branch ?? null;
  const year = profile.academic_year ?? null;

  if (!department || !year) {
    return {
      payload: buildStudentPortalPayload({
        evaloraLive: [],
        evaloraUpcoming: [],
        facultyLive: [],
        facultyUpcoming: [],
        slotNotices: [],
        department,
        year,
        message: 'Complete your profile (department and year) to see scheduled examinations.',
      }),
      studentName: profile.full_name ?? email ?? null,
    };
  }

  const scheduleRows = await prisma.examSchedule.findMany({
    where: { status: { not: 'ended' } },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });

  let schedules = scheduleRows.map(mapSchedule);
  if (schedules.length) {
    schedules = await syncExpiredLiveExamSchedulesPrisma(schedules);
  }

  const approvedRequests = await prisma.facultyExamRequest.findMany({
    where: { status: 'approved', publishedTestId: { not: null } },
    select: {
      id: true,
      title: true,
      topic: true,
      description: true,
      department: true,
      publishedTestId: true,
    },
    take: 200,
  });

  const extras = new Map<string, { duration_minutes?: number; topic?: string | null }>();
  for (const row of approvedRequests) {
    extras.set(row.id, {
      topic: sanitizeStudentExamTopic(row.topic ?? null, department),
    });
  }

  const rollNumber = rollNumberFromUser(email ?? profile.email ?? '', null);
  const { openLinkRequestIds, joinedOpenLinkRequestIds } =
    await getOpenLinkRequestVisibility(rollNumber);

  const schedulesForPartition: ExamScheduleRow[] = [];
  for (const schedule of schedules) {
    if (
      !studentMaySeeOpenLinkExam(
        schedule.faculty_exam_request_id,
        openLinkRequestIds,
        joinedOpenLinkRequestIds,
      )
    ) {
      continue;
    }
    if (!schedule.slot_number || !rollNumber) {
      schedulesForPartition.push(schedule);
      continue;
    }
    const rosterHit = await prisma.examSlotRosterEntry.findFirst({
      where: {
        scheduleId: schedule.id,
        rollNumber: rollNumber.replace(/\s+/g, '').toUpperCase(),
      },
    });
    const rosterCount = await prisma.examSlotRosterEntry.count({
      where: { scheduleId: schedule.id },
    });
    if (rosterCount === 0 || rosterHit) {
      schedulesForPartition.push(schedule);
    }
  }

  const publishedRequestIds = new Set(approvedRequests.map((r) => r.id));
  const publishedSchedules = schedules.filter((s) => {
    const reqId = s.faculty_exam_request_id;
    return reqId != null && publishedRequestIds.has(String(reqId));
  });

  const faculty = partitionSchedulesForStudent(
    schedulesForPartition.filter((s) =>
      publishedSchedules.some((p) => p.id === s.id),
    ),
    department,
    year,
    extras,
  );

  const supplementalLive = listLiveFacultyExamsForStudent(
    approvedRequests
      .filter((r): r is typeof r & { publishedTestId: string } => Boolean(r.publishedTestId))
      .filter((r) =>
        studentMaySeeOpenLinkExam(r.id, openLinkRequestIds, joinedOpenLinkRequestIds),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        topic: sanitizeStudentExamTopic(r.topic, department),
        description: r.description,
        duration_minutes: 0,
        target_years: [],
        target_branches: r.department ? [r.department] : [],
        published_test_id: r.publishedTestId,
        department: r.department ?? '',
      })),
    publishedSchedules,
    department,
    year,
    extras,
  );

  const facultyLive = dedupeFacultyExamSchedules([...faculty.live, ...supplementalLive]);
  const facultyUpcoming = dedupeFacultyExamSchedules(faculty.upcoming);

  return {
    payload: buildStudentPortalPayload({
      evaloraLive: [],
      evaloraUpcoming: [],
      facultyLive,
      facultyUpcoming,
      slotNotices: [],
      department,
      year,
    }),
    studentName: profile.full_name ?? email ?? null,
  };
}
