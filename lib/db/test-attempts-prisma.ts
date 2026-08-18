import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Test, TestAttempt } from '@/lib/types';
import { adaptQuestionRow, adaptTestRow } from '@/lib/practice-mappers';
import {
  fallbackTestForAttempt,
  normalizeAttemptRow,
  resolveStoredPercent,
  testIdsMatch,
  type AttemptRow,
  type CompletedAttemptSummary,
  type DashboardAttemptView,
  type PersistAttemptInput,
} from '@/lib/test-attempts';
import { roundScorePercent } from '@/lib/format-score';
import {
  isUuidAttemptId,
  resolveTestIdForInsertPrisma,
  resolveTestIdForInsertSync,
} from '@/lib/db/resolve-test-id-for-insert';
import {
  appendStudentDashboardStatPrisma,
  buildStatEntry as buildDashboardStatEntryPrisma,
} from '@/lib/db/student-dashboard-stats-prisma';
import { ELEVATEX_EXAM_NAME, isElevateXTestId } from '@/lib/elevatex';
import {
  encodeElevateXScorecardAnswers,
  parseElevateXScorecardFromAnswers,
} from '@/lib/placement/scorecard-payload';
import { findCompletedElevateXAttemptForUser } from '@/lib/elevatex/completed-attempt';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import {
  findCompletedAttemptForSchedulePrisma,
  loadScheduleAttemptContext,
  normalizeAttemptRound,
} from '@/lib/exam-attempt-round';
import type { Prisma as PrismaTypes } from '@prisma/client';

function elevateXTitleWhere(examName?: string | null): PrismaTypes.TestAttemptWhereInput {
  const name = examName?.trim();
  if (name) {
    return { testTitle: { equals: name, mode: 'insensitive' } };
  }
  return {
    OR: [
      { testTitle: { contains: 'ElevateX', mode: 'insensitive' } },
      { testTitle: { contains: ELEVATEX_EXAM_NAME, mode: 'insensitive' } },
    ],
  };
}

export class AttemptConflictError extends Error {
  readonly attemptId: string;
  constructor(attemptId: string) {
    super('Attempt already submitted');
    this.attemptId = attemptId;
  }
}

export class AttemptDeadlineError extends Error {
  constructor() {
    super('Exam time is already over.');
  }
}

const OPEN_ATTEMPT_STATUSES = ['in_progress', 'started', 'active'] as const;

export function isTransientPrismaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /timeout|timed out|ECONNRESET|ECONNREFUSED|too many clients|connection|P1001|P1008|P1017|P2024|Can't reach database/i.test(
    msg,
  );
}

export async function withPrismaRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientPrismaError(err) || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw last;
}

/** Close stray autosave rows after a student has submitted ElevateX. */
export async function reconcileElevateXStaleInProgressPrisma(): Promise<number> {
  const completed = await prisma.testAttempt.findMany({
    where: {
      ...elevateXTitleWhere(),
      status: { in: ['completed', 'submitted'] },
      completedAt: { not: null },
    },
    select: { userId: true },
    distinct: ['userId'],
    take: 3000,
  });
  const userIds = completed.map((r) => r.userId);
  if (!userIds.length) return 0;

  const result = await prisma.testAttempt.updateMany({
    where: {
      userId: { in: userIds },
      status: { in: ['in_progress', 'started', 'active'] },
      ...elevateXTitleWhere(),
    },
    data: {
      status: 'abandoned',
      completedAt: new Date(),
    },
  });
  return result.count;
}

async function abandonOtherElevateXInProgress(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  keepAttemptId: string,
  completedAt: Date,
): Promise<void> {
  await tx.testAttempt.updateMany({
    where: {
      userId,
      id: { not: keepAttemptId },
      status: { in: ['in_progress', 'started', 'active'] },
      ...elevateXTitleWhere(),
    },
    data: {
      status: 'abandoned',
      completedAt,
    },
  });
}

type AttemptConstraintGlobal = {
  attemptConstraintsEnsured?: boolean;
  attemptConstraintsAttempted?: boolean;
};

const attemptConstraintGlobal = globalThis as typeof globalThis & AttemptConstraintGlobal;

export async function ensureAttemptConstraintsPrisma(): Promise<void> {
  if (attemptConstraintGlobal.attemptConstraintsEnsured) return;
  if (attemptConstraintGlobal.attemptConstraintsAttempted) return;
  attemptConstraintGlobal.attemptConstraintsAttempted = true;
  try {
  await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS test_attempts_one_completed_per_user_test_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_one_completed_per_schedule_idx
      ON test_attempts (user_id, schedule_id)
      WHERE schedule_id IS NOT NULL
        AND status IN ('completed', 'submitted');
    CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_one_completed_per_user_test_idx
    ON test_attempts (user_id, test_id)
      WHERE schedule_id IS NULL
        AND test_id IS NOT NULL
        AND status IN ('completed', 'submitted');
  `);
  attemptConstraintGlobal.attemptConstraintsEnsured = true;
  } catch (err) {
    console.warn(
      '[test-attempts] ensureAttemptConstraints skipped:',
      err instanceof Error ? err.message : err,
    );
  }
}

function toAttemptRow(row: {
  id: string;
  userId: string;
  testId: string | null;
  testTitle: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  score: Prisma.Decimal | null;
  percentageScore: Prisma.Decimal | null;
  totalScore: Prisma.Decimal | null;
  answers: Prisma.JsonValue | null;
  timeTaken: number | null;
  status: string;
  createdAt: Date;
}): AttemptRow {
  return {
    id: row.id,
    user_id: row.userId,
    test_id: row.testId ?? undefined,
    test_title: row.testTitle,
    started_at: row.startedAt?.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null,
    score: row.score != null ? Number(row.score) : null,
    percentage_score: row.percentageScore != null ? Number(row.percentageScore) : null,
    total_score: row.totalScore != null ? Number(row.totalScore) : null,
    answers: row.answers,
    time_taken: row.timeTaken,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

export async function ensureStudentUserRowPrisma(user: {
  id: string;
  email?: string | null;
  fullName?: string | null;
}): Promise<void> {
  const email = user.email?.trim().toLowerCase() || `${user.id}@student.local`;
  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email,
      fullName: user.fullName ?? '',
      subscriptionStatus: 'free',
    },
    update: {},
  });
}

function isPrismaUniqueViolation(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('Unique constraint') || msg.includes('test_attempts_one_completed');
}

function isPrismaForeignKeyViolation(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2003') {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('Foreign key') || msg.includes('violates foreign key');
}

function resolveAnswersForSubmitPersist(input: FinalizeAttemptInput): Record<string, unknown> {
  const scorecard = parseElevateXScorecardFromAnswers(input.answers);
  if (scorecard) {
    const proctor = input.answers?.__proctor;
    return encodeElevateXScorecardAnswers(
      scorecard,
      proctor && typeof proctor === 'object'
        ? { __proctor: proctor as Record<string, unknown> }
        : undefined,
    );
  }
  if (input.answers && Object.keys(input.answers).length > 0) {
    return input.answers;
  }
  return {
    __submit: true,
    scorePercent: clampScorePercent(input.scorePercent),
    at: input.submittedAtIso,
  };
}

async function patchAttemptAnswersJsonPrisma(
  userId: string,
  attemptId: string,
  answersJson: string,
): Promise<void> {
  if (!isUuidAttemptId(attemptId)) return;
  await prisma.$executeRaw`
    UPDATE test_attempts
    SET answers = ${answersJson}::jsonb
    WHERE id = ${attemptId.trim()}::uuid AND user_id = ${userId}::uuid
  `;
}

/** Fastest submit — score + status; optional answers (ElevateX scorecard). */
async function completeTestAttemptMinimalPrisma(input: {
  userId: string;
  attemptId: string;
  scorePercent: number;
  elapsedSec: number;
  completedAt: Date;
  answersJson?: string;
}): Promise<{ id: string; elapsedSec: number } | null> {
  if (!isUuidAttemptId(input.attemptId)) return null;
  const updated = input.answersJson
    ? await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
        UPDATE test_attempts
        SET
          completed_at = ${input.completedAt},
          status = 'completed',
          score = ${input.scorePercent},
          percentage_score = ${input.scorePercent},
          time_taken = ${input.elapsedSec},
          answers = ${input.answersJson}::jsonb
        WHERE id = ${input.attemptId.trim()}::uuid
          AND user_id = ${input.userId}::uuid
        RETURNING id::text AS id, time_taken
      `
    : await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
        UPDATE test_attempts
        SET
          completed_at = ${input.completedAt},
          status = 'completed',
          score = ${input.scorePercent},
          percentage_score = ${input.scorePercent},
          time_taken = ${input.elapsedSec}
        WHERE id = ${input.attemptId.trim()}::uuid
          AND user_id = ${input.userId}::uuid
        RETURNING id::text AS id, time_taken
      `;
  const row = updated[0];
  if (!row?.id) return null;
  return { id: row.id, elapsedSec: row.time_taken ?? input.elapsedSec };
}

async function completeLatestOpenMinimalPrisma(input: {
  userId: string;
  scorePercent: number;
  elapsedSec: number;
  completedAt: Date;
  answersJson?: string;
}): Promise<{ id: string; elapsedSec: number } | null> {
  const updated = input.answersJson
    ? await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
        UPDATE test_attempts AS t
        SET
          completed_at = ${input.completedAt},
          status = 'completed',
          score = ${input.scorePercent},
          percentage_score = ${input.scorePercent},
          time_taken = ${input.elapsedSec},
          answers = ${input.answersJson}::jsonb
        WHERE t.id = (
          SELECT id
          FROM test_attempts
          WHERE user_id = ${input.userId}::uuid
            AND completed_at IS NULL
            AND status IN ('in_progress', 'started', 'active')
          ORDER BY created_at DESC
          LIMIT 1
        )
        RETURNING t.id::text AS id, t.time_taken
      `
    : await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
        UPDATE test_attempts AS t
        SET
          completed_at = ${input.completedAt},
          status = 'completed',
          score = ${input.scorePercent},
          percentage_score = ${input.scorePercent},
          time_taken = ${input.elapsedSec}
        WHERE t.id = (
      SELECT id
      FROM test_attempts
      WHERE user_id = ${input.userId}::uuid
        AND completed_at IS NULL
        AND status IN ('in_progress', 'started', 'active')
      ORDER BY created_at DESC
      LIMIT 1
    )
    RETURNING t.id::text AS id, t.time_taken
  `;
  const row = updated[0];
  if (!row?.id) return null;
  return { id: row.id, elapsedSec: row.time_taken ?? input.elapsedSec };
}

async function rawCompleteLatestOpenAttempt(input: {
  userId: string;
  resolvedTestId: string | null;
  title: string;
  now: Date;
  scorePercent: number;
  rawNetScore: number;
  elapsedForPersist: number;
  answersJson: string;
}): Promise<{ id: string; elapsedSec: number } | null> {
  const updated = await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
    UPDATE test_attempts AS t
    SET
      test_id = COALESCE(${input.resolvedTestId}, t.test_id),
      test_title = ${input.title},
      completed_at = ${input.now},
      status = 'completed',
      score = ${input.scorePercent},
      percentage_score = ${input.scorePercent},
      total_score = ${input.rawNetScore},
      answers = ${input.answersJson}::jsonb,
      time_taken = ${input.elapsedForPersist}
    WHERE t.id = (
      SELECT id
      FROM test_attempts
      WHERE user_id = ${input.userId}::uuid
        AND completed_at IS NULL
        AND status IN ('in_progress', 'started', 'active')
      ORDER BY created_at DESC
      LIMIT 1
    )
    RETURNING t.id::text AS id, t.time_taken
  `;
  if (!updated[0]?.id) return null;
  return {
    id: updated[0].id,
    elapsedSec: updated[0].time_taken ?? input.elapsedForPersist,
  };
}

async function rawCompleteAttemptRow(input: {
  userId: string;
  attemptId?: string;
  resolvedTestId: string | null;
  title: string;
  now: Date;
  scorePercent: number;
  rawNetScore: number;
  elapsedForPersist: number;
  answersJson: string;
}): Promise<{ id: string; elapsedSec: number } | null> {
  const attemptId = input.attemptId?.trim();
  if (attemptId && isUuidAttemptId(attemptId)) {
    const updated = await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
      UPDATE test_attempts
      SET
        test_id = ${input.resolvedTestId},
        test_title = ${input.title},
        completed_at = ${input.now},
        status = 'completed',
        score = ${input.scorePercent},
        percentage_score = ${input.scorePercent},
        total_score = ${input.rawNetScore},
        answers = ${input.answersJson}::jsonb,
        time_taken = ${input.elapsedForPersist}
      WHERE id = ${attemptId}::uuid AND user_id = ${input.userId}::uuid
      RETURNING id::text AS id, time_taken
    `;
    if (updated[0]?.id) {
      return {
        id: updated[0].id,
        elapsedSec: updated[0].time_taken ?? input.elapsedForPersist,
      };
    }
  }
  return null;
}

async function rawInsertCompletedAttempt(input: {
  userId: string;
  resolvedTestId: string | null;
  title: string;
  now: Date;
  scorePercent: number;
  rawNetScore: number;
  elapsedForPersist: number;
  answersJson: string;
}): Promise<{ id: string; elapsedSec: number }> {
  const inserted = await prisma.$queryRaw<{ id: string; time_taken: number | null }[]>`
    INSERT INTO test_attempts (
      user_id,
      test_id,
      test_title,
      started_at,
      completed_at,
      status,
      score,
      percentage_score,
      total_score,
      answers,
      time_taken
    ) VALUES (
      ${input.userId}::uuid,
      ${input.resolvedTestId},
      ${input.title},
      ${input.now},
      ${input.now},
      'completed',
      ${input.scorePercent},
      ${input.scorePercent},
      ${input.rawNetScore},
      ${input.answersJson}::jsonb,
      ${input.elapsedForPersist}
    )
    RETURNING id::text AS id, time_taken
  `;
  const row = inserted[0];
  if (!row?.id) throw new Error('Insert returned no id');
  return { id: row.id, elapsedSec: row.time_taken ?? input.elapsedForPersist };
}

async function submitTestAttemptOneShotPrisma(
  input: FinalizeAttemptInput,
): Promise<{ id: string; elapsedSec: number }> {
  let resolvedTestId = resolveTestIdForInsertSync(input.testId);
  const title = input.testName?.trim() || 'Practice test';
  const now = new Date(input.submittedAtIso);
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Number(input.durationSec)) : 0;
  const scorePercent = clampScorePercent(input.scorePercent);
  const rawNetScore = clampRawNetScore(input.rawNetScore);
  const elapsedFromClient = Math.max(0, Math.floor(Number(input.clientElapsedSec) || 0));
  const elapsedForPersist =
    elapsedFromClient > 0 ? elapsedFromClient : durationSec > 0 ? durationSec : 0;

  const answersForPersist = resolveAnswersForSubmitPersist(input);
  const answersJson = JSON.stringify(answersForPersist);
  const hasScorecard = parseElevateXScorecardFromAnswers(answersForPersist) != null;
  const answersArg = hasScorecard ? answersJson : undefined;

  if (input.attemptId && isUuidAttemptId(input.attemptId)) {
    const minimal = await completeTestAttemptMinimalPrisma({
      userId: input.userId,
      attemptId: input.attemptId,
      scorePercent,
      elapsedSec: elapsedForPersist,
      completedAt: now,
      answersJson: answersArg,
    });
    if (minimal) return minimal;
  }

  const openMinimal = await completeLatestOpenMinimalPrisma({
    userId: input.userId,
    scorePercent,
    elapsedSec: elapsedForPersist,
    completedAt: now,
    answersJson: answersArg,
  });
  if (openMinimal) return openMinimal;

  const completeArgs = {
    userId: input.userId,
    resolvedTestId,
    title,
    now,
    scorePercent,
    rawNetScore,
    elapsedForPersist,
    answersJson,
  };

  const byId = await rawCompleteAttemptRow({
    ...completeArgs,
    attemptId: input.attemptId,
  });
  if (byId) return byId;

  const byOpen = await rawCompleteLatestOpenAttempt(completeArgs);
  if (byOpen) return byOpen;

  try {
    return await rawInsertCompletedAttempt({
      userId: input.userId,
      resolvedTestId,
      title,
      now,
      scorePercent,
      rawNetScore,
      elapsedForPersist,
      answersJson,
    });
  } catch (err) {
    if (isPrismaForeignKeyViolation(err) && resolvedTestId) {
      resolvedTestId = null;
      const retryOpen = await rawCompleteLatestOpenAttempt({
        ...completeArgs,
        resolvedTestId: null,
      });
      if (retryOpen) return retryOpen;
      return rawInsertCompletedAttempt({
        userId: input.userId,
        resolvedTestId: null,
        title,
        now,
        scorePercent,
        rawNetScore,
        elapsedForPersist,
        answersJson,
      });
    }
    if (isPrismaUniqueViolation(err)) {
      const prior = await prisma.testAttempt.findFirst({
        where: input.scheduleId?.trim()
          ? {
              userId: input.userId,
              scheduleId: input.scheduleId.trim(),
              status: { in: ['completed', 'submitted'] },
            }
          : isElevateXTestId(input.testId)
            ? {
                userId: input.userId,
                status: { in: ['completed', 'submitted'] },
                ...elevateXTitleWhere(),
              }
            : resolvedTestId
              ? {
                  userId: input.userId,
                  testId: resolvedTestId,
                  scheduleId: null,
                  status: { in: ['completed', 'submitted'] },
                }
              : {
                  userId: input.userId,
                  status: { in: ['completed', 'submitted'] },
                  testTitle: title,
                },
        orderBy: { completedAt: 'desc' },
        select: { id: true },
      });
      if (prior) throw new AttemptConflictError(prior.id);
    }
    throw err;
  }
}

/**
 * Lean submit — 1–3 RDS round-trips (raw SQL, no transaction).
 * Used on Vercel + RDS where long submit paths routinely time out.
 */
export async function submitTestAttemptLeanPrisma(
  input: FinalizeAttemptInput,
): Promise<{ id: string; elapsedSec: number }> {
  return withPrismaRetry(() => submitTestAttemptOneShotPrisma(input), 3);
}

export type SyncTestAttemptReportInput = {
  userId: string;
  testId: string;
  testName: string;
  scorePercent: number;
  elapsedSec: number;
  completedAtIso: string;
  attemptId?: string;
  totalQuestions?: number;
  answers?: Record<string, unknown>;
};

/** Last-resort persist — minimal UPDATE + dashboard stat (admin reports / live board). */
export async function syncTestAttemptReportPrisma(
  input: SyncTestAttemptReportInput,
): Promise<{ id: string; elapsedSec: number }> {
  const scorePercent = clampScorePercent(input.scorePercent);
  const elapsedSec = Math.max(0, Math.floor(input.elapsedSec) || 0);
  const completedAt = new Date(input.completedAtIso);
  const attemptId = input.attemptId?.trim();
  const answersForPersist = input.answers
    ? resolveAnswersForSubmitPersist({
        userId: input.userId,
        testId: input.testId,
        testName: input.testName,
        scorePercent: input.scorePercent,
        rawNetScore: input.scorePercent,
        answers: input.answers,
        submittedAtIso: input.completedAtIso,
      })
    : null;
  const answersJson = answersForPersist ? JSON.stringify(answersForPersist) : undefined;
  const hasScorecard =
    answersForPersist != null && parseElevateXScorecardFromAnswers(answersForPersist) != null;
  const answersArg = hasScorecard ? answersJson : undefined;

  if (attemptId && isUuidAttemptId(attemptId)) {
    const byId = await completeTestAttemptMinimalPrisma({
      userId: input.userId,
      attemptId,
      scorePercent,
      elapsedSec,
      completedAt,
      answersJson: answersArg,
    });
    if (byId) {
      await persistDashboardStatForSubmit(input, byId.id, byId.elapsedSec, answersForPersist);
      return byId;
    }
  }

  const byOpen = await completeLatestOpenMinimalPrisma({
    userId: input.userId,
    scorePercent,
    elapsedSec,
    completedAt,
    answersJson: answersArg,
  });
  if (byOpen) {
    await persistDashboardStatForSubmit(input, byOpen.id, byOpen.elapsedSec, answersForPersist);
    return byOpen;
  }

  const statId =
    attemptId && isUuidAttemptId(attemptId) ? attemptId : crypto.randomUUID();
  await persistDashboardStatForSubmit(input, statId, elapsedSec, answersForPersist);
  return { id: statId, elapsedSec };
}

async function persistDashboardStatForSubmit(
  input: SyncTestAttemptReportInput,
  id: string,
  elapsedSec: number,
  answersForPersist?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await appendStudentDashboardStatPrisma(
      input.userId,
      buildDashboardStatEntryPrisma({
        id,
        userId: input.userId,
        testId: input.testId,
        testName: input.testName,
        scorePercent: clampScorePercent(input.scorePercent),
        elapsedSec,
        completedAtIso: input.completedAtIso,
        totalQuestions: input.totalQuestions,
        answers: answersForPersist ?? input.answers,
      }),
    );
  } catch (err) {
    console.warn('[syncTestAttemptReport] dashboard stat skipped:', err);
  }
}

/** Persist roll on the student profile when known from ElevateX / roster login. */
export async function syncStudentRollNumberPrisma(
  userId: string,
  rollNumber: string,
): Promise<void> {
  const roll = rollNumber.replace(/\s+/g, '').toUpperCase();
  if (!roll) return;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { rollNumber: roll },
    });
  } catch {
    // Unique constraint — roll may already belong to another row; roll-based checks still apply.
  }
}

export async function queryAttemptsPrisma(userId: string): Promise<AttemptRow[]> {
  const rows = await prisma.testAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(toAttemptRow);
}

export async function findCompletedAttemptForTestPrisma(
  userId: string,
  testId: string,
  scheduleId?: string | null,
): Promise<CompletedAttemptSummary | null> {
  if (scheduleId?.trim()) {
    return findCompletedAttemptForSchedulePrisma(userId, scheduleId.trim());
  }

  const rows = await queryAttemptsPrisma(userId);
  for (const row of rows) {
    if (!testIdsMatch(row.test_id, testId)) continue;
    const status = String(row.status ?? '').toLowerCase();
    if (status !== 'completed' && status !== 'submitted' && !row.completed_at) continue;
    const attempt = normalizeAttemptRow(row);
    return {
      id: attempt.id,
      score: attempt.score ?? 0,
      completed_at: attempt.completed_at,
    };
  }
  return null;
}

export async function fetchAttemptsForUserPrisma(userId: string): Promise<DashboardAttemptView[]> {
  const rows = await queryAttemptsPrisma(userId);
  if (!rows.length) return [];

  const testIds = [...new Set(rows.map((r) => String(r.test_id ?? '')).filter(Boolean))];
  const tests = testIds.length
    ? await prisma.test.findMany({ where: { id: { in: testIds } } })
    : [];
  const byId = new Map(tests.map((t) => [t.id, adaptTestRow(t as Record<string, unknown>)]));

  return rows.map((row) => {
    const attempt = normalizeAttemptRow(row);
    const titleFromRow = (row as { test_title?: string }).test_title;
    const test =
      byId.get(attempt.test_id) ??
      (titleFromRow
        ? { ...fallbackTestForAttempt(attempt), name: titleFromRow }
        : fallbackTestForAttempt(attempt));
    return { ...attempt, test };
  });
}

export async function persistTestAttemptPrisma(input: PersistAttemptInput): Promise<{ id: string }> {
  await ensureAttemptConstraintsPrisma();
  const resolvedTestId = await resolveTestIdForInsertPrisma(input.testId);
  const title = input.testName?.trim() || 'Practice test';

  const proctorMetadata =
    input.proctorSessionId != null ||
    input.proctorViolations != null ||
    input.proctorAutoSubmit != null
      ? {
          proctor_session_id: input.proctorSessionId ?? null,
          proctor_violations: input.proctorViolations ?? 0,
          proctor_auto_submit: input.proctorAutoSubmit ?? false,
        }
      : undefined;

  const row = await prisma.testAttempt.create({
    data: {
      userId: input.userId,
      testId: resolvedTestId,
      testTitle: title,
      startedAt: new Date(input.startedAtIso),
      completedAt: new Date(input.completedAtIso),
      status: 'completed',
      score: input.scorePercent,
      percentageScore: input.scorePercent,
      totalScore: input.rawNetScore,
      answers: input.answers as Prisma.InputJsonValue,
      timeTaken: input.elapsedSec,
      proctorMetadata: proctorMetadata as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  });

  return { id: row.id };
}

type FinalizeAttemptInput = {
  userId: string;
  studentEmail?: string | null;
  testId: string;
  testName: string;
  scorePercent: number;
  rawNetScore: number;
  answers: Record<string, unknown>;
  submittedAtIso: string;
  attemptId?: string;
  clientElapsedSec?: number;
  durationSec?: number;
  proctorSessionId?: string;
  proctorViolations?: number;
  proctorAutoSubmit?: boolean;
  scheduleId?: string | null;
  slotNumber?: number | null;
  attemptRound?: number | null;
};

function resolveElapsedForFinalize(input: {
  clientElapsedSec?: number;
  durationSec: number;
  startedAt: Date;
  now: Date;
}): number {
  const startedMs = input.startedAt.getTime();
  const serverElapsedSec = Math.max(0, Math.floor((input.now.getTime() - startedMs) / 1000));
  const clientElapsedSec =
    input.clientElapsedSec != null && Number.isFinite(input.clientElapsedSec)
      ? Math.max(0, Math.floor(input.clientElapsedSec))
      : null;
  let elapsedForPersist =
    clientElapsedSec != null && clientElapsedSec > 0 ? clientElapsedSec : serverElapsedSec;
  const submitGraceSec = 10 * 60;
  const durationSec = input.durationSec;
  if (durationSec > 0) {
    const deadlineLimit = durationSec + submitGraceSec;
    if (elapsedForPersist > deadlineLimit) {
      if (
        clientElapsedSec != null &&
        clientElapsedSec > 0 &&
        clientElapsedSec <= deadlineLimit
      ) {
        elapsedForPersist = clientElapsedSec;
      } else if (clientElapsedSec != null && clientElapsedSec > 0) {
        elapsedForPersist = Math.min(elapsedForPersist, deadlineLimit);
      } else {
        throw new AttemptDeadlineError();
      }
    }
  }
  return elapsedForPersist;
}

function buildProctorMetadata(input: FinalizeAttemptInput): Prisma.InputJsonValue | undefined {
  if (
    input.proctorSessionId == null &&
    input.proctorViolations == null &&
    input.proctorAutoSubmit == null
  ) {
    return undefined;
  }
  return {
          proctor_session_id: input.proctorSessionId ?? null,
          proctor_violations: input.proctorViolations ?? 0,
          proctor_auto_submit: input.proctorAutoSubmit ?? false,
  } as Prisma.InputJsonValue;
}

function scheduleFieldsFromInput(
  input: Pick<FinalizeAttemptInput, 'scheduleId' | 'slotNumber' | 'attemptRound'>,
): { scheduleId?: string; slotNumber?: number | null; attemptRound?: number } {
  if (!input.scheduleId?.trim()) return {};
  return {
    scheduleId: input.scheduleId.trim(),
    slotNumber: input.slotNumber ?? null,
    attemptRound: normalizeAttemptRound(input.attemptRound ?? 1),
  };
}

function priorCompletedWhereForFinalize(
  input: FinalizeAttemptInput,
  resolvedTestId: string | null,
  excludeAttemptId?: string,
): PrismaTypes.TestAttemptWhereInput {
  const exclude = excludeAttemptId ? { id: { not: excludeAttemptId } } : {};
  if (input.scheduleId?.trim()) {
    return {
      userId: input.userId,
      scheduleId: input.scheduleId.trim(),
      status: { in: ['completed', 'submitted'] },
      ...exclude,
    };
  }
  if (isElevateXTestId(input.testId)) {
    return {
      userId: input.userId,
      status: { in: ['completed', 'submitted'] },
      ...elevateXTitleWhere(input.testName),
      ...exclude,
    };
  }
  if (resolvedTestId) {
    return {
      userId: input.userId,
      testId: resolvedTestId,
      scheduleId: null,
      status: { in: ['completed', 'submitted'] },
      ...exclude,
    };
  }
  return {
    userId: input.userId,
    status: { in: ['completed', 'submitted'] },
    ...exclude,
  };
}

async function resolveScheduleFieldsForAttempt(
  input: Pick<FinalizeAttemptInput, 'scheduleId' | 'slotNumber' | 'attemptRound'>,
): Promise<{ scheduleId?: string; slotNumber?: number | null; attemptRound?: number }> {
  if (input.scheduleId?.trim()) {
    const ctx = await loadScheduleAttemptContext(input.scheduleId.trim());
    if (ctx) {
      return {
        scheduleId: ctx.scheduleId,
        slotNumber: input.slotNumber ?? ctx.slotNumber,
        attemptRound: normalizeAttemptRound(input.attemptRound ?? ctx.attemptRound),
      };
    }
    return scheduleFieldsFromInput(input);
  }
  return {};
}

function clampScorePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, roundScorePercent(value)));
}

function clampRawNetScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99999999.99, Math.max(0, value));
}

function openAttemptWhereForTest(
  userId: string,
  testId: string,
  resolvedTestId: string | null,
  testName?: string | null,
): PrismaTypes.TestAttemptWhereInput {
  const base: PrismaTypes.TestAttemptWhereInput = {
    userId,
    status: { in: [...OPEN_ATTEMPT_STATUSES] },
    completedAt: null,
  };
  if (isElevateXTestId(testId)) {
    return { ...base, ...elevateXTitleWhere(testName) };
  }
  if (resolvedTestId) {
    return { ...base, testId: resolvedTestId };
  }
  return base;
}

async function findOpenCandidateForFinalize(
  userId: string,
  testId: string,
  resolvedTestId: string | null,
  testName?: string | null,
  attemptId?: string,
) {
  const id = attemptId?.trim();
  if (id) {
    const byId = await prisma.testAttempt.findFirst({
      where: {
        id,
        userId,
        status: { in: [...OPEN_ATTEMPT_STATUSES] },
        completedAt: null,
      },
    });
    if (byId) return byId;
  }
  return prisma.testAttempt.findFirst({
    where: openAttemptWhereForTest(userId, testId, resolvedTestId, testName),
    orderBy: { createdAt: 'desc' },
  });
}

async function completeOpenAttemptRow(
  input: FinalizeAttemptInput,
  resolvedTestId: string | null,
  candidate: { id: string; startedAt: Date | null },
  answers: Record<string, unknown>,
): Promise<{ id: string; elapsedSec: number }> {
  const priorWhere = priorCompletedWhereForFinalize(input, resolvedTestId, candidate.id);
  const prior = await prisma.testAttempt.findFirst({
    where: priorWhere,
    orderBy: { completedAt: 'desc' },
    select: { id: true },
  });
  if (prior) throw new AttemptConflictError(prior.id);

  const title = input.testName?.trim() || 'Practice test';
  const now = new Date(input.submittedAtIso);
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Number(input.durationSec)) : 0;
  const startedAt = candidate.startedAt ?? now;
  const elapsedForPersist = resolveElapsedForFinalize({
    clientElapsedSec: input.clientElapsedSec,
    durationSec,
    startedAt,
    now,
  });
  const scorePercent = clampScorePercent(input.scorePercent);
  const rawNetScore = clampRawNetScore(input.rawNetScore);
  const proctorMetadata = buildProctorMetadata(input);
  const scheduleFields = await resolveScheduleFieldsForAttempt(input);

  const updated = await prisma.testAttempt.update({
    where: { id: candidate.id },
    data: {
      testId: resolvedTestId,
      testTitle: title,
      startedAt,
      completedAt: now,
      status: 'completed',
      score: scorePercent,
      percentageScore: scorePercent,
      totalScore: rawNetScore,
      answers: answers as Prisma.InputJsonValue,
      timeTaken: elapsedForPersist,
      proctorMetadata,
      ...scheduleFields,
    },
    select: { id: true, timeTaken: true },
  });

  if (isElevateXTestId(input.testId)) {
    void prisma.testAttempt
      .updateMany({
        where: {
          userId: input.userId,
          id: { not: updated.id },
          status: { in: [...OPEN_ATTEMPT_STATUSES] },
          ...elevateXTitleWhere(input.testName),
        },
        data: { status: 'abandoned', completedAt: now },
      })
      .catch(() => undefined);
  }

  return { id: updated.id, elapsedSec: updated.timeTaken ?? elapsedForPersist };
}

/** Fast path: single-row update when autosave already created the attempt (no advisory lock). */
async function finalizeOpenAttemptDirectPrisma(
  input: FinalizeAttemptInput,
  resolvedTestId: string | null,
): Promise<{ id: string; elapsedSec: number } | null> {
  const candidate = await findOpenCandidateForFinalize(
    input.userId,
    input.testId,
    resolvedTestId,
    input.testName,
    input.attemptId,
  );
  if (!candidate) return null;

  try {
    return await completeOpenAttemptRow(input, resolvedTestId, candidate, input.answers);
  } catch (error) {
    if (error instanceof AttemptConflictError || error instanceof AttemptDeadlineError) {
      throw error;
    }
    const minimal = {
      __submit_recovery: true,
      scorePercent: clampScorePercent(input.scorePercent),
    };
    return completeOpenAttemptRow(input, resolvedTestId, candidate, minimal);
  }
}

/** Last resort — score + status only so students are not stuck after RDS timeouts. */
async function finalizeEmergencySubmitPrisma(
  input: FinalizeAttemptInput,
  resolvedTestId: string | null,
): Promise<{ id: string; elapsedSec: number }> {
  const now = new Date(input.submittedAtIso);
  const title = input.testName?.trim() || 'Practice test';
  const scorePercent = clampScorePercent(input.scorePercent);
  const rawNetScore = clampRawNetScore(input.rawNetScore);
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Number(input.durationSec)) : 0;
  const elapsedForPersist = resolveElapsedForFinalize({
    clientElapsedSec: input.clientElapsedSec,
    durationSec,
    startedAt: now,
    now,
  });
  const minimalAnswers = {
    __emergency_submit: true,
    scorePercent,
    at: input.submittedAtIso,
  };
  const proctorMetadata = buildProctorMetadata(input);

  const attemptId = input.attemptId?.trim();
  if (attemptId) {
    const row = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: input.userId },
      select: { id: true },
    });
    if (row) {
      const updated = await prisma.testAttempt.update({
        where: { id: row.id },
        data: {
          testId: resolvedTestId,
          testTitle: title,
          completedAt: now,
          status: 'completed',
          score: scorePercent,
          percentageScore: scorePercent,
          totalScore: rawNetScore,
          answers: minimalAnswers as Prisma.InputJsonValue,
          timeTaken: elapsedForPersist,
          proctorMetadata,
        },
        select: { id: true, timeTaken: true },
      });
      return { id: updated.id, elapsedSec: updated.timeTaken ?? elapsedForPersist };
    }
  }

  const open = await findOpenCandidateForFinalize(
    input.userId,
    input.testId,
    resolvedTestId,
    input.testName,
    input.attemptId,
  );
  if (open) {
    const updated = await prisma.testAttempt.update({
      where: { id: open.id },
      data: {
        testId: resolvedTestId,
        testTitle: title,
        completedAt: now,
        status: 'completed',
        score: scorePercent,
        percentageScore: scorePercent,
        totalScore: rawNetScore,
        answers: minimalAnswers as Prisma.InputJsonValue,
        timeTaken: elapsedForPersist,
        proctorMetadata,
      },
      select: { id: true, timeTaken: true },
    });
    return { id: updated.id, elapsedSec: updated.timeTaken ?? elapsedForPersist };
  }

  const created = await prisma.testAttempt.create({
    data: {
      userId: input.userId,
      testId: resolvedTestId,
      testTitle: title,
      startedAt: now,
      completedAt: now,
      status: 'completed',
      score: scorePercent,
      percentageScore: scorePercent,
      totalScore: rawNetScore,
      answers: minimalAnswers as Prisma.InputJsonValue,
      timeTaken: elapsedForPersist,
      proctorMetadata,
    },
    select: { id: true, timeTaken: true },
  });
  return { id: created.id, elapsedSec: created.timeTaken ?? elapsedForPersist };
}

export async function finalizeTestAttemptPrisma(
  input: FinalizeAttemptInput,
): Promise<{ id: string; elapsedSec: number }> {
  try {
    return await withPrismaRetry(() => submitTestAttemptLeanPrisma(input), 2);
  } catch (error) {
    if (error instanceof AttemptConflictError || error instanceof AttemptDeadlineError) {
      throw error;
    }
    console.warn('[finalizeTestAttempt] lean submit failed, trying legacy path:', error);
  }

  void ensureAttemptConstraintsPrisma().catch(() => undefined);
  const resolvedTestId = await resolveTestIdForInsertPrisma(input.testId);
  const title = input.testName?.trim() || 'Practice test';
  const now = new Date(input.submittedAtIso);
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Number(input.durationSec)) : 0;
  const proctorMetadata = buildProctorMetadata(input);

  try {
    const fast = await withPrismaRetry(
      () => finalizeOpenAttemptDirectPrisma(input, resolvedTestId),
      3,
    );
    if (fast) return fast;
  } catch (error) {
    if (error instanceof AttemptConflictError || error instanceof AttemptDeadlineError) {
      throw error;
    }
  }

  const runFinalize = async () =>
    prisma.$transaction(
      async (tx) => {
      const priorWhere: PrismaTypes.TestAttemptWhereInput = isElevateXTestId(input.testId)
        ? {
            userId: input.userId,
            status: { in: ['completed', 'submitted'] },
            ...elevateXTitleWhere(input.testName),
          }
        : resolvedTestId
          ? {
            userId: input.userId,
            testId: resolvedTestId,
            status: { in: ['completed', 'submitted'] },
            }
          : {
              userId: input.userId,
              status: { in: ['completed', 'submitted'] },
          };

      const prior = await tx.testAttempt.findFirst({
        where: priorWhere,
        orderBy: { completedAt: 'desc' },
        select: { id: true },
      });
      if (prior) {
        throw new AttemptConflictError(prior.id);
      }

      let candidate =
        input.attemptId?.trim()
          ? await tx.testAttempt.findFirst({
              where: {
                id: input.attemptId.trim(),
                userId: input.userId,
              },
            })
          : null;
      if (
        candidate &&
        isCompletedAttemptStatus(candidate.status, candidate.completedAt?.toISOString() ?? null)
      ) {
        throw new AttemptConflictError(candidate.id);
      }
      if (!candidate) {
        candidate = await tx.testAttempt.findFirst({
          where: openAttemptWhereForTest(input.userId, input.testId, resolvedTestId),
          orderBy: { createdAt: 'desc' },
        });
      }

      const scorePercent = clampScorePercent(input.scorePercent);
      const rawNetScore = clampRawNetScore(input.rawNetScore);
      const startedAt = candidate?.startedAt ?? now;
      const elapsedForPersist = resolveElapsedForFinalize({
        clientElapsedSec: input.clientElapsedSec,
        durationSec,
        startedAt,
        now,
      });

      if (candidate) {
        const updated = await tx.testAttempt.update({
          where: { id: candidate.id },
          data: {
            testId: resolvedTestId,
            testTitle: title,
            startedAt,
            completedAt: now,
            status: 'completed',
            score: scorePercent,
            percentageScore: scorePercent,
            totalScore: rawNetScore,
            answers: input.answers as Prisma.InputJsonValue,
            timeTaken: elapsedForPersist,
            proctorMetadata,
          },
          select: { id: true, timeTaken: true },
        });
        if (isElevateXTestId(input.testId)) {
          await abandonOtherElevateXInProgress(tx, input.userId, updated.id, now);
        }
        return { id: updated.id, elapsedSec: updated.timeTaken ?? elapsedForPersist };
      }

      const created = await tx.testAttempt.create({
        data: {
          userId: input.userId,
          testId: resolvedTestId,
          testTitle: title,
          startedAt: now,
          completedAt: now,
          status: 'completed',
          score: scorePercent,
          percentageScore: scorePercent,
          totalScore: rawNetScore,
          answers: input.answers as Prisma.InputJsonValue,
          timeTaken: elapsedForPersist,
          proctorMetadata,
        },
        select: { id: true, timeTaken: true },
      });
      if (isElevateXTestId(input.testId)) {
        await abandonOtherElevateXInProgress(tx, input.userId, created.id, now);
      }
      return { id: created.id, elapsedSec: created.timeTaken ?? elapsedForPersist };
    },
      { maxWait: 5_000, timeout: 15_000 },
    );

  try {
    return await withPrismaRetry(runFinalize, 2);
  } catch (error) {
    if (error instanceof AttemptConflictError || error instanceof AttemptDeadlineError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('test_attempts_one_completed_per_user_test_idx')) {
      const latest = await prisma.testAttempt.findFirst({
        where: {
          userId: input.userId,
          testId: resolvedTestId,
          status: { in: ['completed', 'submitted'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (latest) throw new AttemptConflictError(latest.id);
    }
    console.warn('[finalizeTestAttempt] transaction failed, emergency submit:', msg);
    try {
      return await withPrismaRetry(
        () => finalizeEmergencySubmitPrisma(input, resolvedTestId),
        2,
      );
    } catch (emergencyErr) {
      const emergencyMsg = emergencyErr instanceof Error ? emergencyErr.message : String(emergencyErr);
      console.error('[finalizeTestAttempt] emergency submit failed:', emergencyMsg);
    throw error;
    }
  }
}

/** Create in-progress row in one INSERT (leaderboard heartbeat when no attempt id yet). */
export async function createOpenProgressLeanPrisma(input: {
  userId: string;
  studentEmail?: string | null;
  testId: string;
  testName: string;
  scorePercent: number;
  elapsedSec: number;
  answers: Record<string, unknown>;
  startedAtIso: string;
}): Promise<{ id: string; startedAtIso: string }> {
  const resolvedTestId = resolveTestIdForInsertSync(input.testId);
  const startedAt = new Date(input.startedAtIso);
  const answersJson = JSON.stringify(input.answers);
  const inserted = await prisma.$queryRaw<{ id: string; started_at: Date | null }[]>`
    INSERT INTO test_attempts (
      user_id,
      test_id,
      test_title,
      started_at,
      status,
      score,
      percentage_score,
      answers,
      time_taken
    ) VALUES (
      ${input.userId}::uuid,
      ${resolvedTestId},
      ${input.testName},
      ${startedAt},
      'in_progress',
      ${input.scorePercent},
      ${input.scorePercent},
      ${answersJson}::jsonb,
      ${input.elapsedSec}
    )
    RETURNING id::text AS id, started_at
  `;
  const row = inserted[0];
  if (!row?.id) throw new Error('Progress insert returned no id');
  return {
    id: row.id,
    startedAtIso: row.started_at?.toISOString() ?? input.startedAtIso,
  };
}

/** Single-row heartbeat update when the client already has an open attempt id. */
export async function patchOpenAttemptProgressPrisma(input: {
  userId: string;
  attemptId: string;
  testName: string;
  scorePercent: number;
  elapsedSec: number;
  answers: Record<string, unknown>;
  proctorSessionId?: string;
  proctorViolationCount?: number;
}): Promise<{ id: string; startedAtIso: string } | null> {
  const attemptId = input.attemptId.trim();
  if (!attemptId) return null;

  const answersJson = JSON.stringify(input.answers);
  const updated = await prisma.$queryRaw<{ id: string; started_at: Date | null }[]>`
    UPDATE test_attempts
    SET
      test_title = ${input.testName},
      percentage_score = ${input.scorePercent},
      score = ${input.scorePercent},
      answers = ${answersJson}::jsonb,
      time_taken = ${input.elapsedSec}
    WHERE id = ${attemptId}::uuid
      AND user_id = ${input.userId}::uuid
      AND completed_at IS NULL
      AND status IN ('in_progress', 'started', 'active')
    RETURNING id::text AS id, started_at
  `;
  const row = updated[0];
  if (!row?.id) return null;

  return {
    id: row.id,
    startedAtIso: row.started_at?.toISOString() ?? new Date().toISOString(),
  };
}

export async function upsertExamProgressPrisma(input: {
  userId: string;
  testId: string;
  testName: string;
  scorePercent: number;
  elapsedSec: number;
  answers: Record<string, unknown>;
  attemptId?: string;
  startedAtIso?: string;
  proctorSessionId?: string;
  proctorViolationCount?: number;
  scheduleId?: string | null;
  slotNumber?: number | null;
  attemptRound?: number | null;
}): Promise<{ id: string; startedAtIso: string }> {
  await ensureAttemptConstraintsPrisma();

  if (input.scheduleId?.trim()) {
    const prior = await findCompletedAttemptForSchedulePrisma(input.userId, input.scheduleId.trim());
    if (prior) {
      const row = await prisma.testAttempt.findFirst({
        where: { id: prior.id },
        select: { startedAt: true },
      });
      return {
        id: prior.id,
        startedAtIso: row?.startedAt?.toISOString() ?? new Date().toISOString(),
      };
    }
  } else if (isElevateXTestId(input.testId)) {
        const done = await findCompletedElevateXAttemptForUser(input.userId, input.testName);
    if (done) {
      const row = await prisma.testAttempt.findFirst({
        where: { id: done.id },
        select: { startedAt: true },
      });
      return {
        id: done.id,
        startedAtIso: row?.startedAt?.toISOString() ?? new Date().toISOString(),
      };
    }
  } else {
    const prior = await findCompletedAttemptForTestPrisma(
      input.userId,
      input.testId,
      input.scheduleId,
    );
    if (prior) {
      const row = await prisma.testAttempt.findFirst({
        where: { id: prior.id },
        select: { startedAt: true },
      });
      return {
        id: prior.id,
        startedAtIso: row?.startedAt?.toISOString() ?? new Date().toISOString(),
      };
    }
  }

  if (input.attemptId?.trim()) {
    const row = await prisma.testAttempt.findFirst({
      where: { id: input.attemptId.trim(), userId: input.userId },
      select: { id: true, status: true, completedAt: true, startedAt: true },
    });
    if (
      row &&
      isCompletedAttemptStatus(row.status, row.completedAt?.toISOString() ?? null)
    ) {
      return {
        id: row.id,
        startedAtIso: row.startedAt?.toISOString() ?? new Date().toISOString(),
      };
    }
  }

  const resolvedTestId = resolveTestIdForInsertSync(input.testId);
  const now = new Date();
  const proctorMeta =
    input.proctorSessionId || input.proctorViolationCount
      ? {
          proctor_session_id: input.proctorSessionId ?? null,
          proctor_violations: input.proctorViolationCount ?? 0,
        }
      : undefined;

  const scheduleFields = await resolveScheduleFieldsForAttempt(input);

  const patch = {
    userId: input.userId,
    testId: resolvedTestId,
    testTitle: input.testName,
    percentageScore: input.scorePercent,
    score: input.scorePercent,
    status: 'in_progress' as const,
    answers: input.answers as Prisma.InputJsonValue,
    timeTaken: input.elapsedSec,
    completedAt: null,
    proctorMetadata: proctorMeta as Prisma.InputJsonValue | undefined,
    ...scheduleFields,
  };

  if (input.attemptId) {
    const updated = await prisma.testAttempt.updateMany({
      where: {
        id: input.attemptId,
        userId: input.userId,
        status: { in: [...OPEN_ATTEMPT_STATUSES] },
      },
      data: patch,
    });
    if (updated.count > 0) {
      const row = await prisma.testAttempt.findFirst({
        where: { id: input.attemptId, userId: input.userId },
        select: { startedAt: true },
      });
      return {
        id: input.attemptId,
        startedAtIso: row?.startedAt?.toISOString() ?? input.startedAtIso ?? now.toISOString(),
      };
    }
  }

  const openWhere: PrismaTypes.TestAttemptWhereInput = isElevateXTestId(input.testId)
    ? {
        userId: input.userId,
        status: { in: ['in_progress', 'started', 'active'] },
        ...elevateXTitleWhere(input.testName),
      }
    : {
        userId: input.userId,
        status: { in: ['in_progress', 'started', 'active'] },
        testId: resolvedTestId,
      };

  const open = await prisma.testAttempt.findMany({
    where: openWhere,
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, testId: true },
  });

  const existing = open[0];
  if (existing) {
    const updated = await prisma.testAttempt.update({
      where: { id: existing.id },
      data: patch,
      select: { id: true, startedAt: true },
    });
    return {
      id: updated.id,
      startedAtIso: updated.startedAt?.toISOString() ?? now.toISOString(),
    };
  }

  const startedAt = input.startedAtIso ? new Date(input.startedAtIso) : now;
  const created = await prisma.testAttempt.create({
    data: {
      ...patch,
      startedAt,
    },
    select: { id: true, startedAt: true },
  });
  return {
    id: created.id,
    startedAtIso: created.startedAt?.toISOString() ?? startedAt.toISOString(),
  };
}

export async function loadTestRowForTakePrisma(testId: string): Promise<Test | null> {
  const test = await prisma.test.findFirst({
    where: { OR: [{ id: testId }, ...( /^\d+$/.test(testId) ? [] : []) ] },
    include: { category: true },
  });

  if (test) {
    const adapted = adaptTestRow(test as Record<string, unknown>);
    if (!adapted.category_slug && test.category?.slug) {
      adapted.category_slug = test.category.slug;
    }
    return adapted;
  }

  const fer = await prisma.facultyExamRequest.findFirst({
    where: { publishedTestId: testId, status: 'approved' },
  });

  if (!fer?.title) return null;

  const now = new Date().toISOString();
  const qs = Array.isArray(fer.questionsJson) ? fer.questionsJson : [];
  return {
    id: testId,
    name: fer.title,
    category_id: '',
    duration: 30,
    total_questions: qs.length,
    passing_score: null,
    description: fer.description,
    difficulty_level: 'medium',
    is_paid: false,
    created_at: now,
    updated_at: now,
    question_time_limit_sec: null,
    category_slug: 'department-exams',
  };
}

export async function loadQuestionsForTakePrisma(testId: string) {
  const { dedupeQuestionsByStem } = await import('@/lib/questions/dedupe-questions');

  const links = await prisma.testQuestion.findMany({
    where: { testId },
    orderBy: { sortOrder: 'asc' },
  });
  if (links.length) {
    const ids = links.map((l) => l.questionId);
    const rows = await prisma.question.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = links
      .map((l) => byId.get(l.questionId))
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (ordered.length) {
      return dedupeQuestionsByStem(
        ordered.map((q) => adaptQuestionRow(q as Record<string, unknown>)),
      );
    }
  }

  const direct = await prisma.question.findMany({
    where: { testId },
    orderBy: { createdAt: 'asc' },
  });
  if (direct.length) {
    return dedupeQuestionsByStem(
      direct.map((q) => adaptQuestionRow(q as Record<string, unknown>)),
    );
  }

  const fer = await prisma.facultyExamRequest.findFirst({
    where: { publishedTestId: testId, status: 'approved' },
  });

  if (fer?.questionsJson && Array.isArray(fer.questionsJson)) {
    const { facultyQuestionsToUiQuestions } = await import('@/lib/load-test-for-take');
    const { parseQuestionsJson } = await import('@/lib/faculty-exams');
    const items = parseQuestionsJson(fer.questionsJson);
    if (items.length) {
      return dedupeQuestionsByStem(facultyQuestionsToUiQuestions(items, testId));
    }
  }

  return [];
}

export async function linkProctorViolationsPrisma(
  userId: string,
  attemptId: string,
  testId: string | null,
  sessionId: string,
): Promise<void> {
  try {
  await prisma.examViolation.updateMany({
    where: {
      userId,
      metadata: {
        path: ['sessionId'],
        equals: sessionId,
      },
    },
    data: {
      attemptId,
        testId: testId ?? undefined,
    },
  });
  } catch (err) {
    console.warn('[test-attempts] linkProctorViolations skipped:', err);
  }
}

export async function insertProctorViolationsPrisma(
  rows: Array<{
    userId: string;
    testId: string | null;
    attemptId: string | null;
    violationType: string;
    metadata: Record<string, unknown>;
  }>,
): Promise<number> {
  if (!rows.length) return 0;
  await prisma.examViolation.createMany({
    data: rows.map((r) => ({
      userId: r.userId,
      attemptId: r.attemptId,
      testId: r.testId,
      violationType: r.violationType,
      metadata: r.metadata as Prisma.InputJsonValue,
    })),
  });
  return rows.length;
}

export async function resolveStudentProfilePrisma(userId: string): Promise<{
  branch: string | null;
  academic_year: string | null;
  full_name: string | null;
  email: string | null;
  roll_number: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      fullName: true,
      branch: true,
      academicYear: true,
      rollNumber: true,
    },
  });
  return {
    branch: user?.branch ?? null,
    academic_year: user?.academicYear ?? null,
    full_name: user?.fullName ?? null,
    email: user?.email ?? null,
    roll_number: user?.rollNumber ?? null,
  };
}

export function scoreFromAttemptRow(row: AttemptRow): number {
  return resolveStoredPercent(
    row.percentage_score != null ? Number(row.percentage_score) : null,
    row.score != null ? Number(row.score) : null,
    row.total_score != null ? Number(row.total_score) : null,
  );
}

export type OpenAttemptForTest = {
  id: string;
  answers: Record<string, unknown>;
  scorePercent: number | null;
  savedAtIso: string;
  startedAtIso: string | null;
};

export async function findOpenAttemptForTestPrisma(
  userId: string,
  testId: string,
): Promise<OpenAttemptForTest | null> {
  const resolvedTestId = await resolveTestIdForInsertPrisma(testId);
  const row = await prisma.testAttempt.findFirst({
    where: openAttemptWhereForTest(userId, testId, resolvedTestId),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      answers: true,
      percentageScore: true,
      score: true,
      startedAt: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  const answers =
    row.answers != null && typeof row.answers === 'object'
      ? (row.answers as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    answers,
    scorePercent: roundScorePercent(Number(row.percentageScore ?? row.score ?? 0)),
    savedAtIso: row.startedAt?.toISOString() ?? row.createdAt.toISOString(),
    startedAtIso: row.startedAt?.toISOString() ?? null,
  };
}

export async function fetchInProgressAttemptsPrisma(): Promise<
  Array<{ id: string; userId: string; testId: string | null; testTitle: string | null; score: number }>
> {
  const rows = await prisma.testAttempt.findMany({
    where: { status: 'in_progress' },
    select: {
      id: true,
      userId: true,
      testId: true,
      testTitle: true,
      percentageScore: true,
      score: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    testId: r.testId,
    testTitle: r.testTitle,
    score: roundScorePercent(Number(r.percentageScore ?? r.score ?? 0)),
  }));
}
