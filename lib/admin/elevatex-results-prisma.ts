import { prisma } from '@/lib/prisma';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { ELEVATEX_EXAM_NAME, ELEVATEX_TEST_ID, isElevateXAttemptTitle } from '@/lib/elevatex';
import { PLACEMENT_SECTIONS } from '@/lib/placement/config';
import {
  isElevateXAttemptMeta,
  parseElevateXScorecardFromAnswers,
} from '@/lib/placement/scorecard-payload';
import type { PlacementSectionId, PlacementScorecard } from '@/lib/placement/types';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';
import { isInProgressStatus } from '@/lib/attempt-status';
import { resolveStoredPercent } from '@/lib/test-attempts';

export type ElevateXSectionMarks = {
  earned: number;
  marks: number;
  percent: number;
};

export type ElevateXInProgressRow = {
  attempt_id: string;
  user_id: string;
  roll_number: string;
  student_name: string;
  partial_score: number;
  status: string;
  updated_at: string;
};

export type ElevateXAdminResultRow = {
  attempt_id: string;
  user_id: string;
  roll_number: string;
  student_name: string;
  email: string;
  branch: string | null;
  overall_score: number;
  earned_marks: number;
  total_marks: number;
  status: string;
  submitted_at: string | null;
  sections: Partial<Record<PlacementSectionId, ElevateXSectionMarks>>;
  has_full_scorecard: boolean;
};

function parseStatAttempts(raw: unknown): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id);
  });
}

function sectionsFromScorecard(
  scorecard: PlacementScorecard | null,
): Partial<Record<PlacementSectionId, ElevateXSectionMarks>> {
  const out: Partial<Record<PlacementSectionId, ElevateXSectionMarks>> = {};
  if (!scorecard?.sections?.length) {
    for (const cfg of PLACEMENT_SECTIONS) {
      out[cfg.id] = { earned: 0, marks: cfg.marks, percent: 0 };
    }
    return out;
  }
  for (const s of scorecard.sections) {
    out[s.sectionId] = {
      earned: s.earned,
      marks: s.marks,
      percent: s.percent,
    };
  }
  return out;
}

function rowFromParts(input: {
  attemptId: string;
  userId: string;
  email: string;
  fullName: string | null;
  rollNumber: string | null;
  branch: string | null;
  testTitle: string;
  testId: string | null;
  score: number;
  status: string;
  completedAt: string | null;
  createdAt: string;
  answers: unknown;
}): ElevateXAdminResultRow | null {
  if (!isElevateXAttemptMeta(input.testId, input.testTitle)) return null;

  const scorecard = parseElevateXScorecardFromAnswers(input.answers);
  const roll =
    scorecard?.candidate.hallTicket?.trim() ||
    input.rollNumber?.trim() ||
    rollNumberFromUser(input.email);

  return {
    attempt_id: input.attemptId,
    user_id: input.userId,
    roll_number: roll,
    student_name:
      scorecard?.candidate.fullName?.trim() || input.fullName?.trim() || input.email || 'Student',
    email: input.email,
    branch: input.branch,
    overall_score: scorecard ? scorecard.percentage : input.score,
    earned_marks: scorecard?.earnedMarks ?? 0,
    total_marks: scorecard?.totalMarks ?? 100,
    status: input.status,
    submitted_at: input.completedAt,
    sections: sectionsFromScorecard(scorecard),
    has_full_scorecard: Boolean(scorecard),
  };
}

/** All ElevateX submissions for admin (live exam + reports). */
export async function loadElevateXAdminResultsPrisma(): Promise<ElevateXAdminResultRow[]> {
  const adminIds = new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );

  const users = await prisma.user.findMany({
    where: { adminUser: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      rollNumber: true,
      branch: true,
    },
    take: 5000,
  });

  const userById = new Map(
    users
      .filter((u) => u.email && !adminIds.has(u.id) && !u.email.includes('@admin.'))
      .map((u) => [u.id, u]),
  );

  const byUser = new Map<string, ElevateXAdminResultRow>();

  const attemptRows = await prisma.testAttempt.findMany({
    where: {
      OR: [
        { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
        { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  for (const row of attemptRows) {
    const user = userById.get(row.userId);
    if (!user) continue;
    const mapped = rowFromParts({
      attemptId: row.id,
      userId: row.userId,
      email: user.email,
      fullName: user.fullName,
      rollNumber: user.rollNumber,
      branch: user.branch,
      testTitle: row.testTitle ?? '',
      testId: row.testId,
      score: resolveStoredPercent(
        row.percentageScore != null ? Number(row.percentageScore) : null,
        row.score != null ? Number(row.score) : null,
        row.totalScore != null ? Number(row.totalScore) : null,
      ),
      status: row.status,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      answers: row.answers,
    });
    if (!mapped) continue;
    if (!isCompletedAttemptStatus(mapped.status, mapped.submitted_at)) continue;
    const prev = byUser.get(row.userId);
    if (
      !prev ||
      new Date(mapped.submitted_at ?? mapped.attempt_id) >
        new Date(prev.submitted_at ?? prev.attempt_id)
    ) {
      byUser.set(row.userId, mapped);
    }
  }

  const statRows = await prisma.studentDashboardStat.findMany({
    where: { statKey: 'attempts_feed' },
    select: { userId: true, payload: true },
    take: 5000,
  });

  for (const stat of statRows) {
    const user = userById.get(stat.userId);
    if (!user) continue;
    for (const entry of parseStatAttempts(stat.payload)) {
      if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) continue;
      if (!isCompletedAttemptStatus(entry.status, entry.completed_at)) continue;
      const mapped = rowFromParts({
        attemptId: String(entry.id),
        userId: stat.userId,
        email: user.email,
        fullName: user.fullName,
        rollNumber: user.rollNumber,
        branch: user.branch,
        testTitle: entry.test_name,
        testId: entry.test_id ?? ELEVATEX_TEST_ID,
        score: Number(entry.score ?? 0),
        status: String(entry.status ?? 'completed'),
        completedAt: entry.completed_at,
        createdAt: entry.created_at,
        answers: entry.answers,
      });
      if (!mapped) continue;
      const prev = byUser.get(stat.userId);
      if (
        !prev ||
        new Date(mapped.submitted_at ?? mapped.attempt_id) >
          new Date(prev.submitted_at ?? prev.attempt_id)
      ) {
        byUser.set(stat.userId, mapped);
      }
    }
  }

  return Array.from(byUser.values()).sort((a, b) => {
    const rollCmp = a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    if (rollCmp !== 0) return rollCmp;
    return b.overall_score - a.overall_score;
  });
}

/** Students currently in the exam (autosave / heartbeat, not yet submitted). */
export async function loadElevateXInProgressPrisma(): Promise<ElevateXInProgressRow[]> {
  const adminIds = new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );
  const users = await prisma.user.findMany({
    where: { adminUser: null },
    select: { id: true, email: true, fullName: true, rollNumber: true },
    take: 5000,
  });
  const userById = new Map(
    users
      .filter((u) => u.email && !adminIds.has(u.id) && !u.email.includes('@admin.'))
      .map((u) => [u.id, u]),
  );

  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rows = await prisma.testAttempt.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ['in_progress', 'started', 'active'] },
      OR: [
        { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
        { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const byUser = new Map<string, ElevateXInProgressRow>();
  for (const row of rows) {
    const user = userById.get(row.userId);
    if (!user) continue;
    if (!isInProgressStatus(row.status) || row.completedAt) continue;
    const partial = resolveStoredPercent(
      row.percentageScore != null ? Number(row.percentageScore) : null,
      row.score != null ? Number(row.score) : null,
      row.totalScore != null ? Number(row.totalScore) : null,
    );
    byUser.set(row.userId, {
      attempt_id: row.id,
      user_id: row.userId,
      roll_number: user.rollNumber ?? rollNumberFromUser(user.email),
      student_name: user.fullName?.trim() || user.email,
      partial_score: partial,
      status: row.status,
      updated_at: row.createdAt.toISOString(),
    });
  }

  const heartbeatCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const sessions = await prisma.studentActiveSession.findMany({
    where: { lastHeartbeat: { gte: heartbeatCutoff } },
    take: 200,
  });
  for (const session of sessions) {
    if (byUser.has(session.userId)) continue;
    const user = userById.get(session.userId);
    if (!user) continue;
    byUser.set(session.userId, {
      attempt_id: `session-${session.userId}`,
      user_id: session.userId,
      roll_number: user.rollNumber ?? rollNumberFromUser(user.email),
      student_name: user.fullName?.trim() || user.email,
      partial_score: 0,
      status: 'in_progress',
      updated_at: session.lastHeartbeat.toISOString(),
    });
  }

  return Array.from(byUser.values()).sort((a, b) =>
    a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true }),
  );
}

export function isElevateXTitle(title: string | null | undefined): boolean {
  return isElevateXAttemptTitle(title) || title?.toLowerCase().includes('elevatex') === true;
}
