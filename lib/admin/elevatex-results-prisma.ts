import { prisma } from '@/lib/prisma';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import {
  getIstDayBoundsIso,
  getTodayDateKeyInIST,
  isInstantOnDateKey,
} from '@/lib/admin/report-date-filter';
import { ELEVATEX_EXAM_NAME, ELEVATEX_TEST_ID, isElevateXAttemptTitle } from '@/lib/elevatex';
import {
  elevateXTestAttemptWhere,
  finalizeOpenElevateXAttemptsAfterExamPrisma,
  isElevateXExamWindowOpenPrisma,
} from '@/lib/elevatex/exam-window';
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
  const submittedAt =
    input.completedAt != null && String(input.completedAt).trim()
      ? input.completedAt
      : scorecard || isCompletedAttemptStatus(input.status, input.completedAt)
        ? input.createdAt
        : null;
  const status =
    scorecard || isCompletedAttemptStatus(input.status, input.completedAt)
      ? 'completed'
      : input.status;

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
    status,
    submitted_at: submittedAt,
    sections: sectionsFromScorecard(scorecard),
    has_full_scorecard: Boolean(scorecard),
  };
}

type ElevateXStudentUser = {
  id: string;
  email: string;
  fullName: string | null;
  rollNumber: string | null;
  branch: string | null;
};

const elevatexTitleWhere = elevateXTestAttemptWhere;

async function loadAdminUserIds(): Promise<Set<string>> {
  return new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );
}

function isStudentUser(
  user: { id: string; email: string | null } | null | undefined,
  adminIds: Set<string>,
): user is ElevateXStudentUser {
  if (!user?.email) return false;
  if (adminIds.has(user.id)) return false;
  if (user.email.includes('@admin.')) return false;
  return true;
}

async function loadStudentUsersByIds(
  userIds: string[],
  adminIds: Set<string>,
): Promise<Map<string, ElevateXStudentUser>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, ElevateXStudentUser>();
  if (!unique.length) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const users = await prisma.user.findMany({
      where: { id: { in: chunk }, adminUser: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        rollNumber: true,
        branch: true,
      },
    });
    for (const u of users) {
      if (isStudentUser(u, adminIds)) map.set(u.id, u);
    }
  }
  return map;
}

function resultQuality(row: ElevateXAdminResultRow): number {
  if (row.has_full_scorecard && row.submitted_at) return 4;
  if (row.submitted_at) return 3;
  if (isCompletedAttemptStatus(row.status, row.submitted_at)) return 2;
  return 1;
}

function mergeElevateXResult(
  byUser: Map<string, ElevateXAdminResultRow>,
  mapped: ElevateXAdminResultRow,
  userId: string,
): void {
  const prev = byUser.get(userId);
  if (!prev) {
    byUser.set(userId, mapped);
    return;
  }
  const prevQ = resultQuality(prev);
  const nextQ = resultQuality(mapped);
  if (nextQ > prevQ) {
    byUser.set(userId, mapped);
    return;
  }
  if (nextQ < prevQ) return;
  const prevAt = new Date(prev.submitted_at ?? prev.attempt_id).getTime();
  const nextAt = new Date(mapped.submitted_at ?? mapped.attempt_id).getTime();
  if (nextAt >= prevAt) byUser.set(userId, mapped);
}

/** All ElevateX submissions for admin (live exam + reports). */
async function ensureElevateXExamClosedForAdmin(): Promise<void> {
  const { reconcileElevateXStaleInProgressPrisma } = await import(
    '@/lib/db/test-attempts-prisma'
  );
  await reconcileElevateXStaleInProgressPrisma().catch(() => undefined);
  await finalizeOpenElevateXAttemptsAfterExamPrisma().catch(() => undefined);
}

export async function loadElevateXAdminResultsPrisma(): Promise<ElevateXAdminResultRow[]> {
  await ensureElevateXExamClosedForAdmin();

  const adminIds = await loadAdminUserIds();
  const byUser = new Map<string, ElevateXAdminResultRow>();

  const attemptRows = await prisma.testAttempt.findMany({
    where: elevatexTitleWhere(),
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    take: 3000,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          rollNumber: true,
          branch: true,
        },
      },
    },
  });

  const todayKey = getTodayDateKeyInIST();
  const { start, end } = getIstDayBoundsIso(todayKey);
  const todayRows = await prisma.testAttempt.findMany({
    where: {
      ...elevatexTitleWhere(),
      completedAt: { gte: new Date(start), lte: new Date(end) },
    },
    orderBy: { completedAt: 'desc' },
    take: 800,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          rollNumber: true,
          branch: true,
        },
      },
    },
  });

  const seenAttemptIds = new Set<string>();
  for (const row of [...todayRows, ...attemptRows]) {
    if (seenAttemptIds.has(row.id)) continue;
    seenAttemptIds.add(row.id);
    const user = isStudentUser(row.user, adminIds) ? row.user : null;
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
    if (
      !mapped.submitted_at &&
      !mapped.has_full_scorecard &&
      !isCompletedAttemptStatus(mapped.status, mapped.submitted_at)
    ) {
      continue;
    }
    mergeElevateXResult(byUser, mapped, row.userId);
  }

  const statRows = await prisma.studentDashboardStat.findMany({
    where: { statKey: 'attempts_feed' },
    select: { userId: true, payload: true },
    take: 5000,
  });

  const statUserIds = statRows.map((s) => s.userId);
  const userById = await loadStudentUsersByIds(statUserIds, adminIds);

  for (const stat of statRows) {
    const user = userById.get(stat.userId);
    if (!user) continue;
    for (const entry of parseStatAttempts(stat.payload)) {
      if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) continue;
      if (!entry.completed_at && !isCompletedAttemptStatus(entry.status, entry.completed_at)) {
        continue;
      }
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
      mergeElevateXResult(byUser, mapped, stat.userId);
    }
  }

  return Array.from(byUser.values()).sort((a, b) => {
    const rollCmp = a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    if (rollCmp !== 0) return rollCmp;
    return b.overall_score - a.overall_score;
  });
}

/** ElevateX submissions on a given IST calendar day (defaults to today). */
export async function loadElevateXResultsForDateKeyPrisma(
  dateKey: string = getTodayDateKeyInIST(),
): Promise<ElevateXAdminResultRow[]> {
  const all = await loadElevateXAdminResultsPrisma();
  return all.filter((r) => isInstantOnDateKey(r.submitted_at, dateKey));
}

async function loadElevateXSubmittedUserIds(sessionSince?: Date): Promise<Set<string>> {
  const ids = new Set<string>();
  const since = sessionSince ?? null;
  const rows = await prisma.testAttempt.findMany({
    where: {
      status: { in: ['completed', 'submitted'] },
      completedAt: { not: null, ...(since ? { gte: since } : {}) },
      ...elevatexTitleWhere(),
    },
    select: { userId: true },
    distinct: ['userId'],
    take: 3000,
  });
  for (const r of rows) ids.add(r.userId);

  if (!since) {
    const statRows = await prisma.studentDashboardStat.findMany({
      where: { statKey: 'attempts_feed' },
      select: { userId: true, payload: true },
      take: 5000,
    });
    for (const stat of statRows) {
      for (const entry of parseStatAttempts(stat.payload)) {
        if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) continue;
        if (!entry.completed_at && !isCompletedAttemptStatus(entry.status, entry.completed_at)) {
          continue;
        }
        ids.add(stat.userId);
      }
    }
  }

  return ids;
}

/** Students currently in the exam (autosave / heartbeat, not yet submitted). */
export async function loadElevateXInProgressPrisma(options?: {
  sessionSince?: Date;
}): Promise<ElevateXInProgressRow[]> {
  await ensureElevateXExamClosedForAdmin();
  if (!(await isElevateXExamWindowOpenPrisma())) {
    return [];
  }

  const adminIds = await loadAdminUserIds();
  const sessionSince = options?.sessionSince;
  const submittedUserIds = await loadElevateXSubmittedUserIds(sessionSince);

  const since = sessionSince ?? new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rows = await prisma.testAttempt.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ['in_progress', 'started', 'active'] },
      ...elevatexTitleWhere(),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      user: {
        select: { id: true, email: true, fullName: true, rollNumber: true },
      },
    },
  });

  const byUser = new Map<string, ElevateXInProgressRow>();
  for (const row of rows) {
    if (submittedUserIds.has(row.userId)) continue;
    const user = isStudentUser(row.user, adminIds) ? row.user : null;
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
  const sessionUserById = await loadStudentUsersByIds(
    sessions.map((s) => s.userId),
    adminIds,
  );
  for (const session of sessions) {
    if (submittedUserIds.has(session.userId)) continue;
    if (byUser.has(session.userId)) continue;
    const user = sessionUserById.get(session.userId);
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
