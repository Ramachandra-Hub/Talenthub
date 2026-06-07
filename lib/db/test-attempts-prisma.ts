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
import { resolveTestIdForInsertPrisma } from '@/lib/db/resolve-test-id-for-insert';
import { ELEVATEX_EXAM_NAME, isElevateXTestId } from '@/lib/elevatex';
import { findCompletedElevateXAttemptForUser } from '@/lib/elevatex/completed-attempt';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import type { Prisma as PrismaTypes } from '@prisma/client';

function elevateXTitleWhere(): PrismaTypes.TestAttemptWhereInput {
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
      CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_one_completed_per_user_test_idx
      ON test_attempts (user_id, test_id)
      WHERE test_id IS NOT NULL
        AND status IN ('completed', 'submitted')
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
  const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (existing) return;
  await prisma.user.create({
    data: {
      id: user.id,
      email: user.email?.trim().toLowerCase() || `${user.id}@student.local`,
      fullName: user.fullName ?? '',
      subscriptionStatus: 'free',
    },
  });
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
): Promise<CompletedAttemptSummary | null> {
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

export async function finalizeTestAttemptPrisma(input: {
  userId: string;
  testId: string;
  testName: string;
  scorePercent: number;
  rawNetScore: number;
  answers: Record<string, unknown>;
  submittedAtIso: string;
  attemptId?: string;
  durationSec?: number;
  proctorSessionId?: string;
  proctorViolations?: number;
  proctorAutoSubmit?: boolean;
}): Promise<{ id: string; elapsedSec: number }> {
  await ensureAttemptConstraintsPrisma();
  const resolvedTestId = await resolveTestIdForInsertPrisma(input.testId);
  const title = input.testName?.trim() || 'Practice test';
  const now = new Date(input.submittedAtIso);
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Number(input.durationSec)) : 0;

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

  const lockKey = `${input.userId}:${resolvedTestId || input.testId}`;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const priorWhere: PrismaTypes.TestAttemptWhereInput = isElevateXTestId(input.testId)
        ? {
            userId: input.userId,
            status: { in: ['completed', 'submitted'] },
            ...elevateXTitleWhere(),
          }
        : {
            userId: input.userId,
            testId: resolvedTestId,
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
        const openWhere: PrismaTypes.TestAttemptWhereInput = isElevateXTestId(input.testId)
          ? {
              userId: input.userId,
              status: 'in_progress',
              ...elevateXTitleWhere(),
            }
          : {
              userId: input.userId,
              testId: resolvedTestId,
              status: 'in_progress',
            };
        candidate = await tx.testAttempt.findFirst({
          where: openWhere,
          orderBy: { createdAt: 'desc' },
        });
      }

      const startedAt = candidate?.startedAt ?? now;
      const startedMs = startedAt.getTime();
      const elapsedSec = Math.max(0, Math.floor((now.getTime() - startedMs) / 1000));
      const submitGraceSec = 60;
      if (durationSec > 0 && elapsedSec > durationSec + submitGraceSec) {
        throw new AttemptDeadlineError();
      }

      if (candidate) {
        const updated = await tx.testAttempt.update({
          where: { id: candidate.id },
          data: {
            testId: resolvedTestId,
            testTitle: title,
            startedAt,
            completedAt: now,
            status: 'completed',
            score: input.scorePercent,
            percentageScore: input.scorePercent,
            totalScore: input.rawNetScore,
            answers: input.answers as Prisma.InputJsonValue,
            timeTaken: elapsedSec,
            proctorMetadata: proctorMetadata as Prisma.InputJsonValue | undefined,
          },
          select: { id: true, timeTaken: true },
        });
        if (isElevateXTestId(input.testId)) {
          await abandonOtherElevateXInProgress(tx, input.userId, updated.id, now);
        }
        return { id: updated.id, elapsedSec: updated.timeTaken ?? elapsedSec };
      }

      const created = await tx.testAttempt.create({
        data: {
          userId: input.userId,
          testId: resolvedTestId,
          testTitle: title,
          startedAt: now,
          completedAt: now,
          status: 'completed',
          score: input.scorePercent,
          percentageScore: input.scorePercent,
          totalScore: input.rawNetScore,
          answers: input.answers as Prisma.InputJsonValue,
          timeTaken: elapsedSec,
          proctorMetadata: proctorMetadata as Prisma.InputJsonValue | undefined,
        },
        select: { id: true, timeTaken: true },
      });
      if (isElevateXTestId(input.testId)) {
        await abandonOtherElevateXInProgress(tx, input.userId, created.id, now);
      }
      return { id: created.id, elapsedSec: created.timeTaken ?? elapsedSec };
    });
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
    throw error;
  }
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
}): Promise<{ id: string; startedAtIso: string }> {
  await ensureAttemptConstraintsPrisma();

  if (isElevateXTestId(input.testId)) {
    const done = await findCompletedElevateXAttemptForUser(input.userId);
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
    const prior = await findCompletedAttemptForTestPrisma(input.userId, input.testId);
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

  const resolvedTestId = await resolveTestIdForInsertPrisma(input.testId);
  const now = new Date();
  const proctorMeta =
    input.proctorSessionId || input.proctorViolationCount
      ? {
          proctor_session_id: input.proctorSessionId ?? null,
          proctor_violations: input.proctorViolationCount ?? 0,
        }
      : undefined;

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
  };

  if (input.attemptId) {
    const updated = await prisma.testAttempt.updateMany({
      where: { id: input.attemptId, userId: input.userId, status: 'in_progress' },
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
        ...elevateXTitleWhere(),
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
    },
  });
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
    where: {
      userId,
      testId: resolvedTestId,
      status: { in: ['in_progress', 'started', 'active'] },
      completedAt: null,
    },
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
