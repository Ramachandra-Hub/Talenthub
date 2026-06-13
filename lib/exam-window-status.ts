import { prisma } from '@/lib/prisma';
import { COMPETITIVE_ALL_INDIA_TEST_ID } from '@/lib/competitive-exam/exam-definition';
import { isElevateXTestId } from '@/lib/elevatex';
import { isElevateXExamWindowOpenPrisma } from '@/lib/elevatex/exam-window';
import {
  isScheduleWindowOpen,
  scheduleMatchesStudent,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { syncExpiredSchedulesAndFinalizeAttemptsPrisma } from '@/lib/exam-schedule-slot-finalize';
import { testIdsMatch } from '@/lib/test-attempts';

function isUnscheduledPracticeTestId(testId: string): boolean {
  const id = testId.trim().toLowerCase();
  return id.startsWith('fallback-') || id === COMPETITIVE_ALL_INDIA_TEST_ID;
}

function mapSchedule(row: {
  id: string;
  testId: string | null;
  title: string | null;
  facultyExamRequestId: string | null;
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
    faculty_exam_request_id: row.facultyExamRequestId,
    test_id: row.testId ?? '',
    status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
    starts_at: row.startsAt?.toISOString() ?? nowIso,
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: Array.isArray(row.targetDepartments)
      ? (row.targetDepartments as string[])
      : [],
    target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
    slot_number: row.slotNumber,
    slot_capacity: null,
    created_by: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function schedulesForTestPrisma(testId: string): Promise<ExamScheduleRow[]> {
  const rows = await prisma.examSchedule.findMany({
    where: { testId },
    orderBy: { startsAt: 'desc' },
    take: 50,
  });
  return rows.map(mapSchedule).filter((s) => testIdsMatch(s.test_id, testId));
}

export async function resolveStudentScheduleForTestPrisma(input: {
  testId: string;
  department: string;
  year: string;
  rollNumber?: string;
}): Promise<{ isScheduledExam: boolean; schedule: ExamScheduleRow | null }> {
  const testId = input.testId.trim();
  if (!testId || isUnscheduledPracticeTestId(testId)) {
    return { isScheduledExam: false, schedule: null };
  }

  if (isElevateXTestId(testId)) {
    const schedules = await prisma.examSchedule.findMany({
      where: {
        OR: [
          { title: { contains: 'ElevateX', mode: 'insensitive' } },
          { testId },
        ],
      },
      orderBy: { startsAt: 'desc' },
      take: 30,
    });
    const mapped = schedules.map(mapSchedule);
    if (!mapped.length) {
      return { isScheduledExam: true, schedule: null };
    }

    if (input.rollNumber) {
      const normalizedRoll = input.rollNumber.replace(/\s+/g, '').toUpperCase();
      const rosterHit = await prisma.examSlotRosterEntry.findFirst({
        where: {
          rollNumber: normalizedRoll,
          scheduleId: { in: mapped.map((s) => s.id) },
        },
        select: { scheduleId: true },
      });
      if (rosterHit?.scheduleId) {
        const schedule = mapped.find((s) => s.id === rosterHit.scheduleId) ?? null;
        return { isScheduledExam: true, schedule };
      }
    }

    const schedule =
      mapped.find((s) => scheduleMatchesStudent(s, input.department, input.year)) ?? mapped[0];
    return { isScheduledExam: true, schedule };
  }

  const schedules = await schedulesForTestPrisma(testId);
  if (!schedules.length) {
    return { isScheduledExam: false, schedule: null };
  }

  if (input.rollNumber) {
    const normalizedRoll = input.rollNumber.replace(/\s+/g, '').toUpperCase();
    const scheduleIds = schedules.map((s) => s.id);
    const rosterHit = await prisma.examSlotRosterEntry.findFirst({
      where: {
        rollNumber: normalizedRoll,
        scheduleId: { in: scheduleIds },
      },
      select: { scheduleId: true },
    });
    if (rosterHit?.scheduleId) {
      const schedule = schedules.find((s) => s.id === rosterHit.scheduleId) ?? null;
      return { isScheduledExam: true, schedule };
    }
  }

  const schedule =
    schedules.find((s) => scheduleMatchesStudent(s, input.department, input.year)) ??
    schedules[0];
  return { isScheduledExam: true, schedule };
}

export type StudentExamWindowStatus = {
  isScheduledExam: boolean;
  windowOpen: boolean;
  scheduleId: string | null;
  scheduleStatus: string | null;
};

/** Whether the student's exam slot window is still open (used for live auto-submit polling). */
export async function getStudentExamWindowStatusPrisma(input: {
  testId: string;
  department: string;
  year: string;
  rollNumber?: string;
  syncExpired?: boolean;
}): Promise<StudentExamWindowStatus> {
  if (input.syncExpired !== false) {
    await syncExpiredSchedulesAndFinalizeAttemptsPrisma().catch(() => undefined);
  }

  const { isScheduledExam, schedule } = await resolveStudentScheduleForTestPrisma(input);
  if (!isScheduledExam) {
    return {
      isScheduledExam: false,
      windowOpen: true,
      scheduleId: null,
      scheduleStatus: null,
    };
  }

  if (isElevateXTestId(input.testId) && !schedule) {
    const windowOpen = await isElevateXExamWindowOpenPrisma();
    return {
      isScheduledExam: true,
      windowOpen,
      scheduleId: null,
      scheduleStatus: windowOpen ? 'live' : 'ended',
    };
  }

  if (!schedule) {
    return {
      isScheduledExam: true,
      windowOpen: false,
      scheduleId: null,
      scheduleStatus: 'ended',
    };
  }

  const windowOpen = isScheduleWindowOpen(schedule);
  return {
    isScheduledExam: true,
    windowOpen,
    scheduleId: schedule.id,
    scheduleStatus: schedule.status,
  };
}
