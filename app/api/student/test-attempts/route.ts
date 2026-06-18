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
  fetchAttemptsForUserPrisma,
  submitTestAttemptLeanPrisma,
  syncTestAttemptReportPrisma,
  linkProctorViolationsPrisma,
} from '@/lib/db/test-attempts-prisma';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
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
          : 'You have already submitted this exam sitting and cannot take it again.',
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
  let recoverCtx: {
    userId: string;
    testId: string;
    testName: string;
    scorePercent: number;
    elapsedSec: number;
    attemptId?: string;
    totalQuestions?: number;
    answers?: Record<string, unknown>;
  } | null = null;
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
    const scheduleId = typeof body.scheduleId === 'string' ? body.scheduleId.trim() : '';
    const slotNumber =
      body.slotNumber != null && Number.isFinite(Number(body.slotNumber))
        ? Math.floor(Number(body.slotNumber))
        : null;
    const attemptRound =
      body.attemptRound != null && Number.isFinite(Number(body.attemptRound))
        ? Math.floor(Number(body.attemptRound))
        : null;
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

    // Skip RDS access check when the client already has an in-flight attempt (progress heartbeat).
    const skipAccessDb = Boolean(attemptId?.trim()) || clientElapsedSec > 0;
    if (testId && !skipAccessDb) {
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

    const totalQuestions = Number(body.totalQuestions) || 0;
    recoverCtx = {
      userId,
      testId,
      testName,
      scorePercent,
      elapsedSec: clientElapsedSec,
      attemptId,
      totalQuestions: totalQuestions || undefined,
      answers: Object.keys(answersIn).length > 0 ? answersIn : undefined,
    };

    const finalized = await submitTestAttemptLeanPrisma({
      userId,
      studentEmail: auth.ctx.user.email,
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
      scheduleId: scheduleId || undefined,
      slotNumber,
      attemptRound,
    });

    const id = finalized.id;
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

    try {
      await appendStudentDashboardStatPrisma(userId, statEntry);
    } catch (err) {
      console.warn('[test-attempts/submit] dashboard stat append skipped:', err);
    }

    void (async () => {
      if (proctorSessionId) {
        try {
          await linkProctorViolationsPrisma(userId, id, testId || null, proctorSessionId);
        } catch (err) {
          console.warn('[test-attempts/submit] proctor link skipped:', err);
        }
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
    if (
      recoverCtx &&
      !(error instanceof AttemptConflictError) &&
      !(error instanceof AttemptDeadlineError)
    ) {
      try {
        const nowIso = new Date().toISOString();
        const recovered = await syncTestAttemptReportPrisma({
          ...recoverCtx,
          completedAtIso: nowIso,
        });
        const attempt: TestAttempt & { test: { name: string } } = {
          ...normalizeAttemptRow({
            id: recovered.id,
            user_id: recoverCtx.userId,
            test_id: recoverCtx.testId,
            score: recoverCtx.scorePercent,
            percentage_score: recoverCtx.scorePercent,
            status: 'completed',
            created_at: nowIso,
            completed_at: nowIso,
            started_at: nowIso,
            time_taken: recovered.elapsedSec,
            test_title: recoverCtx.testName,
          }),
          test: {
            ...fallbackTestForAttempt({
              id: recovered.id,
              user_id: recoverCtx.userId,
              test_id: recoverCtx.testId,
              started_at: nowIso,
              completed_at: nowIso,
              score: recoverCtx.scorePercent,
              answers: null,
              time_taken: recovered.elapsedSec,
              status: 'completed',
              created_at: nowIso,
            }),
            name: recoverCtx.testName || 'Practice test',
          },
        };
        void releaseStudentSessionPrisma(recoverCtx.userId).catch(() => undefined);
        return NextResponse.json({
          id: recovered.id,
          attempt,
          attempts: [attempt],
          recovered: true,
        });
      } catch (recoverErr) {
        console.warn('[test-attempts/submit] sync recovery failed:', recoverErr);
      }
    }
    return submitErrorResponse(error, submittedTestId);
  }
}
