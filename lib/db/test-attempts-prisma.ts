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
    test_id: row.testId,
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
      score: attempt.score,
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

async function resolveTestIdForInsertPrisma(testId: string): Promise<string | null> {
  if (!testId || testId.startsWith('fallback-') || testId === 'programming-assessment-v1') {
    const first = await prisma.test.findFirst({ select: { id: true } });
    return first?.id ?? null;
  }
  return testId.trim();
}

export async function persistTestAttemptPrisma(input: PersistAttemptInput): Promise<{ id: string }> {
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
}): Promise<{ id: string }> {
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
    testId: input.testId,
    testTitle: input.testName,
    percentageScore: input.scorePercent,
    score: input.scorePercent,
    status: 'in_progress' as const,
    answers: input.answers as Prisma.InputJsonValue,
    timeTaken: input.elapsedSec,
    startedAt: input.startedAtIso ? new Date(input.startedAtIso) : now,
    completedAt: null,
    proctorMetadata: proctorMeta as Prisma.InputJsonValue | undefined,
  };

  if (input.attemptId) {
    const updated = await prisma.testAttempt.updateMany({
      where: { id: input.attemptId, userId: input.userId, status: 'in_progress' },
      data: patch,
    });
    if (updated.count > 0) return { id: input.attemptId };
  }

  const open = await prisma.testAttempt.findMany({
    where: { userId: input.userId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, testId: true },
  });

  const existing = open.find((row) => testIdsMatch(row.testId, input.testId));
  if (existing) {
    await prisma.testAttempt.update({
      where: { id: existing.id },
      data: patch,
    });
    return { id: existing.id };
  }

  const created = await prisma.testAttempt.create({
    data: patch,
    select: { id: true },
  });
  return { id: created.id };
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
  const direct = await prisma.question.findMany({
    where: { testId },
    orderBy: { createdAt: 'asc' },
  });
  if (direct.length) {
    return direct.map((q) => adaptQuestionRow(q as Record<string, unknown>));
  }

  const fer = await prisma.facultyExamRequest.findFirst({
    where: { publishedTestId: testId, status: 'approved' },
  });

  if (fer?.questionsJson && Array.isArray(fer.questionsJson)) {
    const { facultyQuestionsToUiQuestions } = await import('@/lib/load-test-for-take');
    const { parseQuestionsJson } = await import('@/lib/faculty-exams');
    const items = parseQuestionsJson(fer.questionsJson);
    if (items.length) return facultyQuestionsToUiQuestions(items, testId);
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
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
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
