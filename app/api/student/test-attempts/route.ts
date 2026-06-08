import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { fallbackTestForAttempt, normalizeAttemptRow } from '@/lib/test-attempts';
import {
  appendStudentDashboardStatPrisma,
  buildStatEntry as buildStatEntryPrisma,
  fetchStudentDashboardStatsPrisma,
} from '@/lib/db/student-dashboard-stats-prisma';
import {
  AttemptConflictError,
  AttemptDeadlineError,
  ensureStudentUserRowPrisma,
  fetchAttemptsForUserPrisma,
  submitTestAttemptLeanPrisma,
  linkProctorViolationsPrisma,
  releaseStudentSessionPrisma,
} from '@/lib/db/test-attempts-prisma';
import {
  assertStudentCanSubmitAttemptPrisma,
  type ExamAccessResult,
} from '@/lib/db/exam-access-prisma';
import type { TestAttempt } from '@/lib/types';
import { isElevateXTestId } from '@/lib/elevatex';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { slimAnswersForSubmit } from '@/lib/exam-v2/sanitize-answers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUBMIT_ACCESS_TIMEOUT_MS = 2_500;

function submitErrorResponse(error: unknown, testId = ''): NextResponse {
  if (error instanceof AttemptConflictError) {
    return NextResponse.json(
      {
        error: isElevateXTestId(testId)
          ? 'You have already submitted ElevateX. Each roll number may attempt this exam only once.'
          : 'You have already submitted this test and cannot take it again.',
        code: 'already_submitted',
        attemptId: error.attemptId,
      },
      { status: 409 },
    );
  }
  if (error instanceof AttemptDeadlineError) {
    return NextResponse.json(
      {
        error: 'Exam deadline reached. Submission is blocked by server timing rules.',
        code: 'deadline_exceeded',
      },
      { status: 409 },
    );
  }
  const message = error instanceof Error ? error.message : 'Failed to save attempt';
  console.error('[test-attempts/submit]', message, error);
  return NextResponse.json(
    {
      error:
        'Your submission could not be saved on the server. Check your connection and submit again.',
      code: 'submit_persist_failed',
      retryable: true,
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const userId = auth.ctx.user.id;
  let attempts = await fetchStudentDashboardStatsPrisma(userId);
  if (!attempts.length) {
    attempts = await fetchAttemptsForUserPrisma(userId);
  }
  return NextResponse.json({ attempts });
}

export async function POST(request: Request) {
  let submittedTestId = '';
  try {
    const auth = await requireAuth(['student'], request);
    if ('response' in auth) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const scorePercent = Number(body.scorePercent);
    if (!Number.isFinite(scorePercent)) {
      return NextResponse.json({ error: 'scorePercent is required' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const userId = auth.ctx.user.id;
    const examKind = typeof body.examKind === 'string' ? body.examKind : '';
    let testName = typeof body.testName === 'string' ? body.testName : 'Practice test';
    if (examKind === 'programming' && !testName.toLowerCase().includes('programming')) {
      testName = `Programming · ${testName}`;
    } else if (examKind === 'department' && !testName.startsWith('Department')) {
      testName = `Department · ${testName}`;
    }

    const testId = String(body.testId ?? '').trim();
    submittedTestId = testId;
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : undefined;
    const clientElapsedSec = Number(body.elapsedSec) || 0;
    const proctorSessionId =
      typeof body.proctorSessionId === 'string' ? body.proctorSessionId : undefined;
    const proctorViolations = Number(body.proctorViolations) || 0;
    const proctorAutoSubmit = Boolean(body.proctorAutoSubmit);
    const rawNetScore = Number(body.rawNetScore) || scorePercent;

    let durationSec = Number(body.durationSec) || 0;
    if (!durationSec) {
      const durationMinutes = Number(body.durationMinutes) || 0;
      if (durationMinutes > 0) durationSec = durationMinutes * 60;
    }
    if (isElevateXTestId(testId) && durationSec <= 0) {
      durationSec = 60 * 60;
    }

    const accessBranch =
      typeof body.accessBranch === 'string' ? body.accessBranch.trim() : '';
    const accessYear = typeof body.accessYear === 'string' ? body.accessYear.trim() : '';
    const accessRollNumber =
      typeof body.accessRollNumber === 'string' && body.accessRollNumber.trim()
        ? body.accessRollNumber.trim()
        : auth.ctx.user.email
          ? rollNumberFromUser(auth.ctx.user.email)
          : undefined;

    await ensureStudentUserRowPrisma({
      id: userId,
      email: auth.ctx.user.email,
    });

    if (testId) {
      const accessFallback: ExamAccessResult = { allowed: true, schedule: null };
      const access = await Promise.race([
        assertStudentCanSubmitAttemptPrisma(
          userId,
          testId,
          {
            branch: accessBranch,
            academic_year: accessYear,
            roll_number: accessRollNumber,
          },
          { attemptId, clientElapsedSec, durationSec },
        ),
        new Promise<ExamAccessResult>((resolve) =>
          setTimeout(() => resolve(accessFallback), SUBMIT_ACCESS_TIMEOUT_MS),
        ),
      ]);
      if (!access.allowed) {
        return NextResponse.json(
          { error: access.message, code: access.code, locked: true },
          { status: 403 },
        );
      }
    }

    const answersIn =
      body.answers != null && typeof body.answers === 'object'
        ? slimAnswersForSubmit(body.answers as Record<string, unknown>)
        : {};

    const finalized = await submitTestAttemptLeanPrisma({
      userId,
      testId,
      testName,
      scorePercent,
      rawNetScore,
      answers: answersIn,
      submittedAtIso: nowIso,
      attemptId,
      clientElapsedSec,
      durationSec,
      proctorSessionId,
      proctorViolations,
      proctorAutoSubmit,
    });

    const id = finalized.id;
    const totalQuestions = Number(body.totalQuestions) || 0;

    void (async () => {
      const statEntry = buildStatEntryPrisma({
        id,
        userId,
        testId,
        testName,
        scorePercent,
        elapsedSec: finalized.elapsedSec,
        completedAtIso: nowIso,
        totalQuestions: totalQuestions || undefined,
      });
      if (proctorSessionId) {
        try {
          await linkProctorViolationsPrisma(userId, id, testId || null, proctorSessionId);
        } catch (err) {
          console.warn('[test-attempts/submit] proctor link skipped:', err);
        }
      }
      try {
        await appendStudentDashboardStatPrisma(userId, statEntry);
      } catch (err) {
        console.warn('[test-attempts/submit] dashboard stat append skipped:', err);
      }
      try {
        await releaseStudentSessionPrisma(userId);
      } catch (err) {
        console.warn('[test-attempts/submit] session release skipped:', err);
      }
    })();

    const attempt: TestAttempt & { test: { name: string } } = {
      ...normalizeAttemptRow({
        id,
        user_id: userId,
        test_id: testId,
        score: scorePercent,
        percentage_score: scorePercent,
        status: 'completed',
        created_at: nowIso,
        completed_at: nowIso,
        started_at: nowIso,
        time_taken: finalized.elapsedSec,
        test_title: testName,
      }),
      test: {
        ...fallbackTestForAttempt({
          id,
          user_id: userId,
          test_id: testId,
          started_at: nowIso,
          completed_at: nowIso,
          score: scorePercent,
          answers: null,
          time_taken: finalized.elapsedSec,
          status: 'completed',
          created_at: nowIso,
        }),
        name: testName || 'Practice test',
      },
    };

    return NextResponse.json({ id, attempt, attempts: [attempt] });
  } catch (error) {
    return submitErrorResponse(error, submittedTestId);
  }
}
