import { prisma } from '@/lib/prisma';
import { computeServerScorePercent } from '@/lib/exam-v2/server-score';
import { isElevateXTestId } from '@/lib/elevatex';
import {
  isElevateXAttemptMeta,
  parseElevateXScorecardFromAnswers,
} from '@/lib/placement/scorecard-payload';
import {
  scheduleEndMs,
  scheduleStartMs,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { resolveStoredPercent, testIdsMatch } from '@/lib/test-attempts';
import type { Prisma } from '@prisma/client';

const OPEN_ATTEMPT_STATUSES = ['in_progress', 'started', 'active'] as const;

type OpenAttemptRow = {
  id: string;
  userId: string;
  testId: string | null;
  testTitle: string | null;
  startedAt: Date | null;
  createdAt: Date;
  percentageScore: Prisma.Decimal | null;
  score: Prisma.Decimal | null;
  totalScore: Prisma.Decimal | null;
  answers: Prisma.JsonValue | null;
  scheduleId: string | null;
  timeTaken: number | null;
};

function mapPrismaSchedule(row: {
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

function scheduleTestMatch(schedule: ExamScheduleRow, attempt: OpenAttemptRow): boolean {
  const scheduleTestId = String(schedule.test_id ?? '').trim();
  if (scheduleTestId && attempt.testId && testIdsMatch(attempt.testId, scheduleTestId)) {
    return true;
  }
  if (isElevateXTestId(scheduleTestId) || isElevateXAttemptMeta(scheduleTestId, schedule.title)) {
    return isElevateXAttemptMeta(attempt.testId, attempt.testTitle);
  }
  const title = String(schedule.title ?? '').trim().toLowerCase();
  const attemptTitle = String(attempt.testTitle ?? '').trim().toLowerCase();
  if (title && attemptTitle && (attemptTitle.includes(title) || title.includes(attemptTitle))) {
    return true;
  }
  return false;
}

function attemptInScheduleSession(attempt: OpenAttemptRow, schedule: ExamScheduleRow): boolean {
  const startMs = scheduleStartMs(schedule.starts_at) - 120_000;
  const endMs = scheduleEndMs(schedule.ends_at);
  const anchorMs = attempt.startedAt?.getTime() ?? attempt.createdAt.getTime();
  if (!Number.isFinite(anchorMs) || anchorMs < startMs) return false;
  if (endMs !== null && anchorMs > endMs + 300_000) return false;
  return true;
}

async function rosterUserIdsForSchedule(scheduleId: string): Promise<Set<string>> {
  const rolls = await prisma.examSlotRosterEntry.findMany({
    where: { scheduleId },
    select: { rollNumber: true },
  });
  if (!rolls.length) return new Set();

  const normalized = rolls
    .map((r) => r.rollNumber.replace(/\s+/g, '').toUpperCase())
    .filter(Boolean);
  if (!normalized.length) return new Set();

  const users = await prisma.user.findMany({
    where: { rollNumber: { in: normalized } },
    select: { id: true },
    take: 500,
  });

  return new Set(users.map((u) => u.id));
}

async function scoreOpenAttemptForFinalize(
  row: OpenAttemptRow,
): Promise<{ scorePercent: number; rawNetScore: number }> {
  if (isElevateXAttemptMeta(row.testId, row.testTitle)) {
    const scorecard = parseElevateXScorecardFromAnswers(row.answers);
    const score = scorecard
      ? scorecard.percentage
      : resolveStoredPercent(
          row.percentageScore != null ? Number(row.percentageScore) : null,
          row.score != null ? Number(row.score) : null,
          row.totalScore != null ? Number(row.totalScore) : null,
        );
    return { scorePercent: score, rawNetScore: score };
  }

  const answersObj =
    row.answers && typeof row.answers === 'object'
      ? (row.answers as Record<string, unknown>)
      : null;

  if (row.testId && answersObj) {
    const computed = await computeServerScorePercent(row.testId, answersObj, {
      skipCodingExecution: true,
    });
    if (computed) {
      return { scorePercent: computed.scorePercent, rawNetScore: computed.rawNetScore };
    }
  }

  const scorePercent = resolveStoredPercent(
    row.percentageScore != null ? Number(row.percentageScore) : null,
    row.score != null ? Number(row.score) : null,
    row.totalScore != null ? Number(row.totalScore) : null,
  );
  return { scorePercent, rawNetScore: Number(row.totalScore ?? scorePercent) };
}

async function finalizeOneOpenAttempt(row: OpenAttemptRow, now: Date): Promise<boolean> {
  const { scorePercent, rawNetScore } = await scoreOpenAttemptForFinalize(row);
  const startedMs = row.startedAt?.getTime() ?? row.createdAt.getTime();
  const elapsedSec = Math.max(
    row.timeTaken ?? 0,
    Math.max(0, Math.floor((now.getTime() - startedMs) / 1000)),
  );

  const priorAnswers =
    row.answers && typeof row.answers === 'object'
      ? (row.answers as Record<string, unknown>)
      : {};
  const answers = {
    ...priorAnswers,
    __slot_auto_submit: { at: now.toISOString(), reason: 'slot_closed' },
  };

  await prisma.testAttempt.update({
    where: { id: row.id },
    data: {
      status: 'completed',
      completedAt: now,
      score: scorePercent,
      percentageScore: scorePercent,
      totalScore: rawNetScore,
      timeTaken: elapsedSec,
      answers: answers as Prisma.InputJsonValue,
    },
  });
  return true;
}

async function collectOpenAttemptsForSchedule(schedule: ExamScheduleRow): Promise<OpenAttemptRow[]> {
  const since = new Date(scheduleStartMs(schedule.starts_at) - 24 * 60 * 60 * 1000);
  const rosterUserIds = await rosterUserIdsForSchedule(schedule.id);

  const candidates = await prisma.testAttempt.findMany({
    where: {
      status: { in: [...OPEN_ATTEMPT_STATUSES] },
      completedAt: null,
      createdAt: { gte: since },
      OR: [
        { scheduleId: schedule.id },
        ...(rosterUserIds.size
          ? [{ userId: { in: [...rosterUserIds] } }]
          : []),
        ...(schedule.test_id
          ? [{ testId: schedule.test_id }]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      userId: true,
      testId: true,
      testTitle: true,
      startedAt: true,
      createdAt: true,
      percentageScore: true,
      score: true,
      totalScore: true,
      answers: true,
      scheduleId: true,
      timeTaken: true,
    },
  });

  const matched: OpenAttemptRow[] = [];
  const seen = new Set<string>();

  for (const row of candidates) {
    if (seen.has(row.id)) continue;
    if (row.scheduleId === schedule.id) {
      matched.push(row);
      seen.add(row.id);
      continue;
    }
    if (rosterUserIds.has(row.userId) && scheduleTestMatch(schedule, row)) {
      matched.push(row);
      seen.add(row.id);
      continue;
    }
    if (scheduleTestMatch(schedule, row) && attemptInScheduleSession(row, schedule)) {
      matched.push(row);
      seen.add(row.id);
    }
  }

  return matched;
}

/** Mark all in-progress attempts for ended slot schedules as completed (server-side auto-submit). */
export async function finalizeOpenAttemptsForScheduleIdsPrisma(
  scheduleIds: string[],
  now = new Date(),
): Promise<number> {
  const uniqueIds = [...new Set(scheduleIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return 0;

  const scheduleRows = await prisma.examSchedule.findMany({
    where: { id: { in: uniqueIds } },
  });
  if (!scheduleRows.length) return 0;

  const closedUserIds: string[] = [];
  let closed = 0;

  for (const row of scheduleRows) {
    const schedule = mapPrismaSchedule(row);
    const openAttempts = await collectOpenAttemptsForSchedule(schedule);
    for (const attempt of openAttempts) {
      try {
        const ok = await finalizeOneOpenAttempt(attempt, now);
        if (ok) {
          closed += 1;
          closedUserIds.push(attempt.userId);
        }
      } catch (err) {
        console.warn(
          '[exam-schedule-slot-finalize] attempt',
          attempt.id,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  if (closedUserIds.length > 0) {
    await prisma.studentActiveSession
      .deleteMany({ where: { userId: { in: [...new Set(closedUserIds)] } } })
      .catch(() => undefined);
  }

  return closed;
}

/** Sync expired live rows to ended, then auto-submit all open attempts in those slots. */
export async function syncExpiredSchedulesAndFinalizeAttemptsPrisma(
  now = Date.now(),
): Promise<{ endedIds: string[]; attemptsClosed: number }> {
  const cutoff = new Date(now);
  const expired = await prisma.examSchedule.findMany({
    where: {
      status: 'live',
      endsAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (!expired.length) {
    return { endedIds: [], attemptsClosed: 0 };
  }

  const endedIds = expired.map((r) => r.id);
  await prisma.examSchedule.updateMany({
    where: { id: { in: endedIds } },
    data: { status: 'ended', updatedAt: new Date(now) },
  });

  const attemptsClosed = await finalizeOpenAttemptsForScheduleIdsPrisma(endedIds, new Date(now));
  return { endedIds, attemptsClosed };
}
