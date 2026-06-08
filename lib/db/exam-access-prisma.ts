import { prisma } from '@/lib/prisma';
import {
  isScheduleWindowOpen,
  scheduleMatchesStudent,
  type ExamScheduleRow,
  type ExamScheduleStatus,
} from '@/lib/exam-schedule';
import { COMPETITIVE_ALL_INDIA_TEST_ID } from '@/lib/competitive-exam/exam-definition';
import { isElevateXTestId } from '@/lib/elevatex';
import { isElevateXExamWindowOpenPrisma } from '@/lib/elevatex/exam-window';
import { testIdsMatch } from '@/lib/test-attempts';

function isUnscheduledPracticeTestId(testId: string): boolean {
  const id = testId.trim().toLowerCase();
  return id.startsWith('fallback-') || id === COMPETITIVE_ALL_INDIA_TEST_ID;
}

const IN_PROGRESS_GRACE_MS = 4 * 60 * 60 * 1000;
const ELEVATEX_MAX_SESSION_MS = 90 * 60 * 1000;

async function inProgressWithinGrace(attemptId: string, maxMs: number): Promise<boolean> {
  const row = await prisma.testAttempt.findFirst({
    where: { id: attemptId },
    select: { startedAt: true, createdAt: true },
  });
  const startedMs = row?.startedAt?.getTime() ?? row?.createdAt?.getTime() ?? 0;
  if (!startedMs) return false;
  return Date.now() - startedMs <= maxMs;
}

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
  const rows = await prisma.examSchedule.findMany({
    where: { testId },
  });
  return rows.map(mapSchedule).filter((s) => testIdsMatch(s.test_id, testId));
}

export async function checkStudentExamAccessPrisma(input: {
  testId: string;
  department: string;
  year: string;
  rollNumber?: string;
  now?: number;
}): Promise<ExamAccessResult> {
  const testId = input.testId.trim();

  if (isElevateXTestId(testId)) {
    const now = input.now ?? Date.now();
    const windowOpen = await isElevateXExamWindowOpenPrisma(now);
    if (!windowOpen) {
      return {
        allowed: false,
        code: 'NOT_LIVE',
        message: 'ElevateX is not live right now. Check your dashboard for the start time.',
        schedule: null,
      };
    }
    return { allowed: true, schedule: null };
  }

  const schedules = await schedulesForTestPrisma(testId);

  if (schedules.length === 0) {
    if (isUnscheduledPracticeTestId(testId)) {
      return { allowed: true, schedule: null };
    }
    return {
      allowed: false,
      code: 'NOT_LIVE',
      message:
        'This examination has not been scheduled yet. Contact the examination cell or your faculty.',
      schedule: null,
    };
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
  if (isElevateXTestId(testId)) {
    return assertStudentCanReportProgressPrisma(userId, testId, profile);
  }
  return checkStudentExamAccessPrisma({
    testId,
    department: profile.branch ?? '',
    year: profile.academic_year ?? '',
    rollNumber: profile.roll_number ?? undefined,
  });
}

/**
 * Autosave / live leaderboard — must not block mid-exam when slot metadata is loose
 * (e.g. ElevateX with empty year or legacy exam_schedules rows).
 */
export async function assertStudentCanReportProgressPrisma(
  userId: string,
  testId: string,
  profile: { branch: string | null; academic_year: string | null; roll_number?: string | null },
): Promise<ExamAccessResult> {
  if (isElevateXTestId(testId)) {
    const open = await prisma.testAttempt.findFirst({
      where: {
        userId,
        status: { in: ['in_progress', 'started', 'active'] },
        completedAt: null,
        OR: [
          { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
          { testId: testId.trim() },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (open) {
      const windowOpen = await isElevateXExamWindowOpenPrisma();
      if (windowOpen) return { allowed: true, schedule: null };
      if (await inProgressWithinGrace(open.id, ELEVATEX_MAX_SESSION_MS)) {
        return { allowed: true, schedule: null };
      }
    }

    const windowOpen = await isElevateXExamWindowOpenPrisma();
    if (windowOpen) {
      return { allowed: true, schedule: null };
    }

    return {
      allowed: false,
      code: 'NOT_LIVE',
      message: 'ElevateX is not live right now. Check your dashboard for the start time.',
      schedule: null,
    };
  }

  const strict = await assertStudentCanTakeTestPrisma(userId, testId, profile);
  if (strict.allowed) return strict;

  const open = await prisma.testAttempt.findFirst({
    where: {
      userId,
      status: { in: ['in_progress', 'started', 'active'] },
      completedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, testId: true },
  });
  if (open?.testId && testIdsMatch(open.testId, testId)) {
    if (
      strict.allowed ||
      (await inProgressWithinGrace(open.id, IN_PROGRESS_GRACE_MS))
    ) {
      return { allowed: true, schedule: strict.schedule ?? null };
    }
  }

  return strict;
}

export type SubmitAccessOpts = {
  attemptId?: string;
  /** Browser-reported seconds spent in the exam — used when autosave never created a DB row. */
  clientElapsedSec?: number;
  durationSec?: number;
};

/** Final submit — allow finishing an in-flight attempt even after the live window closes. */
export async function assertStudentCanSubmitAttemptPrisma(
  userId: string,
  testId: string,
  profile: { branch: string | null; academic_year: string | null; roll_number?: string | null },
  opts: SubmitAccessOpts = {},
): Promise<ExamAccessResult> {
  const clientElapsedSec = Math.max(0, Math.floor(Number(opts.clientElapsedSec) || 0));
  const durationSec = Math.max(0, Math.floor(Number(opts.durationSec) || 0));
  const submitFinishGraceSec = 10 * 60;

  const findOpenAttempt = async (whereExtra?: { id?: string }) => {
    const base = {
      userId,
      status: { in: ['in_progress', 'started', 'active'] as const },
      completedAt: null,
      ...(whereExtra?.id ? { id: whereExtra.id } : {}),
    };
    return prisma.testAttempt.findFirst({
      where: base,
      orderBy: { createdAt: 'desc' },
      select: { id: true, testId: true, startedAt: true, createdAt: true },
    });
  };

  if (isElevateXTestId(testId)) {
    const elevatexWhere = {
      userId,
      status: { in: ['in_progress', 'started', 'active'] as const },
      completedAt: null,
      OR: [
        { testTitle: { contains: 'ElevateX', mode: 'insensitive' as const } },
        { testId: testId.trim() },
      ],
      ...(opts.attemptId?.trim() ? { id: opts.attemptId.trim() } : {}),
    };
    const open = await prisma.testAttempt.findFirst({
      where: elevatexWhere,
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (open) return { allowed: true, schedule: null };

    const maxSessionSec = Math.floor(ELEVATEX_MAX_SESSION_MS / 1000);
    if (clientElapsedSec > 0 && clientElapsedSec <= maxSessionSec) {
      return { allowed: true, schedule: null };
    }

    const windowOpen = await isElevateXExamWindowOpenPrisma();
    if (windowOpen) return { allowed: true, schedule: null };

    return {
      allowed: false,
      code: 'NOT_LIVE',
      message: 'ElevateX is not live right now. Check your dashboard for the start time.',
      schedule: null,
    };
  }

  if (opts.attemptId?.trim()) {
    const byId = await findOpenAttempt({ id: opts.attemptId.trim() });
    if (byId?.testId && testIdsMatch(byId.testId, testId)) {
      return { allowed: true, schedule: null };
    }
  }

  const open = await findOpenAttempt();
  if (open?.testId && testIdsMatch(open.testId, testId)) {
    return { allowed: true, schedule: null };
  }

  if (
    clientElapsedSec > 0 &&
    durationSec > 0 &&
    clientElapsedSec <= durationSec + submitFinishGraceSec
  ) {
    const schedules = await schedulesForTestPrisma(testId);
    const now = Date.now();
    const recentlyLive = schedules.some((s) => {
      const endMs = s.ends_at ? new Date(s.ends_at).getTime() : NaN;
      if (Number.isFinite(endMs) && now - endMs <= 30 * 60 * 1000) return true;
      return isScheduleWindowOpen(s, now);
    });
    if (recentlyLive) {
      return { allowed: true, schedule: schedules[0] ?? null };
    }
  }

  const strict = await checkStudentExamAccessPrisma({
    testId,
    department: profile.branch ?? '',
    year: profile.academic_year ?? '',
    rollNumber: profile.roll_number ?? undefined,
  });
  if (strict.allowed) return strict;

  if (open?.testId && testIdsMatch(open.testId, testId)) {
    if (await inProgressWithinGrace(open.id, IN_PROGRESS_GRACE_MS)) {
      return { allowed: true, schedule: strict.schedule ?? null };
    }
  }

  return strict;
}
