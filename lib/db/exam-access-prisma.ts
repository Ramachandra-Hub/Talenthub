import { prisma } from '@/lib/prisma';
import {
  isScheduleWindowOpen,
  scheduleMatchesStudent,
  type ExamScheduleRow,
  type ExamScheduleStatus,
} from '@/lib/exam-schedule';
import { testIdsMatch } from '@/lib/test-attempts';

export type ExamAccessResult =
  | { allowed: true; schedule: ExamScheduleRow | null }
  | {
      allowed: false;
      code: 'NOT_LIVE' | 'TARGET_MISMATCH' | 'SLOT_NOT_ASSIGNED' | 'SLOT_WRONG_WINDOW';
      message: string;
      schedule: ExamScheduleRow | null;
    };

function mapSchedule(row: {
  id: string;
  testId: string | null;
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
  const status: ExamScheduleStatus =
    row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled';
  return {
    id: row.id,
    title: row.title ?? 'Exam',
    description: null,
    notice: null,
    faculty_exam_request_id: null,
    test_id: row.testId ?? '',
    status,
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

async function schedulesForTestPrisma(testId: string): Promise<ExamScheduleRow[]> {
  const rows = await prisma.examSchedule.findMany();
  return rows
    .map(mapSchedule)
    .filter((s) => testIdsMatch(s.test_id, testId));
}

export async function checkStudentExamAccessPrisma(input: {
  testId: string;
  department: string;
  year: string;
  rollNumber?: string;
  now?: number;
}): Promise<ExamAccessResult> {
  const schedules = await schedulesForTestPrisma(input.testId.trim());

  if (schedules.length === 0) {
    return { allowed: true, schedule: null };
  }

  const now = input.now ?? Date.now();
  const liveSchedules = schedules.filter((s) => isScheduleWindowOpen(s, now));

  if (liveSchedules.length === 0) {
    const upcoming = schedules.some((s) => s.status === 'scheduled');
    return {
      allowed: false,
      code: 'NOT_LIVE',
      message: upcoming
        ? 'This examination is not live yet. Check your dashboard for the start time.'
        : 'This examination is not available right now.',
      schedule: schedules[0] ?? null,
    };
  }

  if (input.rollNumber) {
    const normalizedRoll = input.rollNumber.replace(/\s+/g, '').toUpperCase();
    const liveScheduleIds = liveSchedules.map((s) => s.id);
    const rosterHit = await prisma.examSlotRosterEntry.findFirst({
      where: {
        rollNumber: normalizedRoll,
        scheduleId: { in: liveScheduleIds },
      },
      select: { scheduleId: true },
    });
    if (rosterHit?.scheduleId) {
      const schedule = liveSchedules.find((s) => s.id === rosterHit.scheduleId) ?? liveSchedules[0];
      return { allowed: true, schedule };
    }

    const anyRoster = await prisma.examSlotRosterEntry.count({
      where: { scheduleId: { in: liveScheduleIds } },
    });
    if (anyRoster > 0) {
      return {
        allowed: false,
        code: 'SLOT_NOT_ASSIGNED',
        message: 'You are not on the roster for this examination slot.',
        schedule: liveSchedules[0] ?? null,
      };
    }
  }

  const schedule =
    liveSchedules.find((s) => scheduleMatchesStudent(s, input.department, input.year)) ??
    liveSchedules[0];

  if (!scheduleMatchesStudent(schedule, input.department, input.year)) {
    return {
      allowed: false,
      code: 'TARGET_MISMATCH',
      message: 'This examination is not scheduled for your department or academic year.',
      schedule,
    };
  }

  return { allowed: true, schedule };
}

export async function assertStudentCanTakeTestPrisma(
  userId: string,
  testId: string,
  profile: { branch: string | null; academic_year: string | null; roll_number?: string | null },
): Promise<ExamAccessResult> {
  return checkStudentExamAccessPrisma({
    testId,
    department: profile.branch ?? '',
    year: profile.academic_year ?? '',
    rollNumber: profile.roll_number ?? undefined,
  });
}
