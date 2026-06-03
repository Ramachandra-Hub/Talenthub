import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import {
  isScheduleWindowOpen,
  resolveExamScheduleStatus,
  scheduleEndMs,
  scheduleStartMs,
} from '@/lib/exam-schedule';
import { ELEVATEX_EXAM_NAME, ELEVATEX_MODULE_KEY } from '@/lib/elevatex';
import {
  isElevateXAttemptMeta,
  parseElevateXScorecardFromAnswers,
} from '@/lib/placement/scorecard-payload';
import { resolveStoredPercent } from '@/lib/test-attempts';
import type { Prisma } from '@prisma/client';

export function elevateXTestAttemptWhere(): Prisma.TestAttemptWhereInput {
  return {
    OR: [
      { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
      { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
    ],
  };
}

function moduleToSchedule(row: {
  id: string;
  title: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ExamScheduleRow {
  return {
    id: row.id,
    title: row.title?.trim() || ELEVATEX_EXAM_NAME,
    description: null,
    notice: null,
    faculty_exam_request_id: null,
    test_id: ELEVATEX_MODULE_KEY,
    status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: [],
    target_years: [],
    slot_number: null,
    slot_capacity: null,
    created_by: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** True while students may still be taking ElevateX (live window or scheduled slot). */
export async function isElevateXExamWindowOpenPrisma(now = Date.now()): Promise<boolean> {
  const modules = await prisma.evaloraModuleSchedule.findMany({
    where: { moduleKey: ELEVATEX_MODULE_KEY, status: { not: 'ended' } },
    orderBy: { startsAt: 'desc' },
    take: 5,
  });

  const maxOpenMs = 90 * 60 * 1000;

  for (const m of modules) {
    const schedule = moduleToSchedule(m);
    const resolved = resolveExamScheduleStatus(schedule, now);
    if (resolved.windowOpen) return true;

    const start = scheduleStartMs(schedule.starts_at);
    const end = scheduleEndMs(schedule.ends_at);

    if (m.status === 'live') {
      if (end !== null && end < now) continue;
      if (end === null && now - start > maxOpenMs) continue;
      if (end === null || end >= now) return true;
    }
    if (m.status === 'scheduled') {
      if (start <= now && (end === null || end >= now)) return true;
    }
  }

  const schedules = await prisma.examSchedule.findMany({
    where: {
      status: { not: 'ended' },
      OR: [
        { title: { contains: 'ElevateX', mode: 'insensitive' } },
        { title: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
      ],
    },
    orderBy: { startsAt: 'desc' },
    take: 10,
  });

  for (const s of schedules) {
    const schedule: ExamScheduleRow = {
      id: s.id,
      title: s.title ?? ELEVATEX_EXAM_NAME,
      description: null,
      notice: null,
      faculty_exam_request_id: null,
      test_id: s.testId ?? ELEVATEX_MODULE_KEY,
      status: s.status === 'live' || s.status === 'ended' ? s.status : 'scheduled',
      starts_at: s.startsAt?.toISOString() ?? new Date().toISOString(),
      ends_at: s.endsAt?.toISOString() ?? null,
      target_departments: [],
      target_years: [],
      slot_number: s.slotNumber,
      slot_capacity: null,
      created_by: null,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString(),
    };
    if (isScheduleWindowOpen(schedule, now)) return true;
    if (s.status === 'live') {
      const start = scheduleStartMs(schedule.starts_at);
      const end = scheduleEndMs(schedule.ends_at);
      if (end !== null && end < now) continue;
      if (end === null && now - start > maxOpenMs) continue;
      if (end === null || end >= now) return true;
    }
  }

  return false;
}

/** Admin: mark ElevateX module + exam schedules ended so the window closes and reports can finalize. */
export async function closeElevateXExamWindowPrisma(now = new Date()): Promise<{
  modulesEnded: number;
  schedulesEnded: number;
}> {
  const [modulesEnded, schedulesEnded] = await Promise.all([
    prisma.evaloraModuleSchedule.updateMany({
      where: {
        moduleKey: ELEVATEX_MODULE_KEY,
        status: { in: ['live', 'scheduled'] },
      },
      data: { status: 'ended', endsAt: now, updatedAt: now },
    }),
    prisma.examSchedule.updateMany({
      where: {
        status: { in: ['live', 'scheduled'] },
        OR: [
          { title: { contains: 'ElevateX', mode: 'insensitive' } },
          { title: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
        ],
      },
      data: { status: 'ended', endsAt: now, updatedAt: now },
    }),
  ]);

  return { modulesEnded: modulesEnded.count, schedulesEnded: schedulesEnded.count };
}

/**
 * When the exam window has ended, close open ElevateX autosave rows so admin sees completed reports.
 */
export async function finalizeOpenElevateXAttemptsAfterExamPrisma(options?: {
  force?: boolean;
}): Promise<number> {
  if (!options?.force && (await isElevateXExamWindowOpenPrisma())) return 0;

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const openRows = await prisma.testAttempt.findMany({
    where: {
      status: { in: ['in_progress', 'started', 'active'] },
      completedAt: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 800,
    select: {
      id: true,
      userId: true,
      testId: true,
      testTitle: true,
      percentageScore: true,
      score: true,
      totalScore: true,
      answers: true,
    },
  });

  const closedUserIds: string[] = [];
  let closed = 0;
  const now = new Date();

  for (const row of openRows) {
    if (!isElevateXAttemptMeta(row.testId, row.testTitle)) continue;
    const scorecard = parseElevateXScorecardFromAnswers(row.answers);
    const score = scorecard
      ? scorecard.percentage
      : resolveStoredPercent(
          row.percentageScore != null ? Number(row.percentageScore) : null,
          row.score != null ? Number(row.score) : null,
          row.totalScore != null ? Number(row.totalScore) : null,
        );

    await prisma.testAttempt.update({
      where: { id: row.id },
      data: {
        status: 'completed',
        completedAt: now,
        score,
        percentageScore: score,
      },
    });
    closed += 1;
    closedUserIds.push(row.userId);
  }

  if (closedUserIds.length > 0) {
    await prisma.studentActiveSession.deleteMany({
      where: { userId: { in: [...new Set(closedUserIds)] } },
    });
  }

  return closed;
}
