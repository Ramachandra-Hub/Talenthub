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
  finalizeTestAttemptPrisma,
  reconcileElevateXStaleInProgressPrisma,
  resolveStudentProfilePrisma,
  linkProctorViolationsPrisma,
  syncStudentRollNumberPrisma,
} from '@/lib/db/test-attempts-prisma';
import {
  assertStudentCanReportProgressPrisma,
  assertStudentCanTakeTestPrisma,
} from '@/lib/db/exam-access-prisma';
import type { TestAttempt } from '@/lib/types';
import { isElevateXTestId } from '@/lib/elevatex';
import { findCompletedElevateXAttempt } from '@/lib/elevatex/completed-attempt';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { prisma } from '@/lib/prisma';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import { computeProgrammingExamScorePercent } from '@/lib/exam-v2/grade-programming-exam';
import { computeServerScorePercent } from '@/lib/exam-v2/server-score';
import { sanitizeAnswersForPersist } from '@/lib/exam-v2/sanitize-answers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

    let scorePercent = Number(body.scorePercent);
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

    let totalQuestions = Number(body.totalQuestions) || 0;
    const answersIn =
      body.answers != null && typeof body.answers === 'object'
        ? (body.answers as Record<string, unknown>)
        : {};

    const testId = String(body.testId ?? '').trim();
    submittedTestId = testId;

    try {
      if (examKind === 'programming' && Object.keys(answersIn).length > 0) {
        const rescored = await computeProgrammingExamScorePercent(answersIn);
        scorePercent = rescored.scorePercent;
        body.rawNetScore = rescored.rawNetScore;
        if (!totalQuestions) totalQuestions = rescored.totalQuestions;
      } else if (testId && Object.keys(answersIn).length > 0 && !isElevateXTestId(testId)) {
        const rescored = await computeServerScorePercent(testId, answersIn, {
          skipCodingExecution: true,
        });
        if (rescored) {
          scorePercent = rescored.scorePercent;
          body.rawNetScore = rescored.rawNetScore;
          if (!totalQuestions) {
            totalQuestions = rescored.totalQuestions;
          }
        }
      }
    } catch (err) {
      console.warn('[test-attempts/submit] server rescoring skipped, using client score:', err);
    }

    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : undefined;
    const proctorSessionId =
      typeof body.proctorSessionId === 'string' ? body.proctorSessionId : undefined;
    const proctorViolations = Number(body.proctorViolations) || 0;
    const proctorAutoSubmit = Boolean(body.proctorAutoSubmit);
    const rawNetScore = Number(body.rawNetScore) || 0;

    await ensureStudentUserRowPrisma({
      id: userId,
      email: auth.ctx.user.email,
    });

    let accessRollNumber: string | undefined;
    if (testId) {
      const profile = await resolveStudentProfilePrisma(userId);
      const accessBranch =
        typeof body.accessBranch === 'string' && body.accessBranch.trim()
          ? body.accessBranch.trim()
          : (profile.branch ?? '');
      const accessYear =
        typeof body.accessYear === 'string' && body.accessYear.trim()
          ? body.accessYear.trim()
          : (profile.academic_year ?? '');
      accessRollNumber =
        typeof body.accessRollNumber === 'string' && body.accessRollNumber.trim()
          ? body.accessRollNumber.trim()
          : (profile.roll_number ??
            (profile.email ? rollNumberFromUser(profile.email) : undefined));
      const access = isElevateXTestId(testId)
        ? await assertStudentCanReportProgressPrisma(userId, testId, {
            branch: accessBranch,
            academic_year: accessYear,
            roll_number: accessRollNumber,
          })
        : await assertStudentCanTakeTestPrisma(userId, testId, {
            branch: accessBranch,
            academic_year: accessYear,
            roll_number: accessRollNumber,
          });
      if (!access.allowed) {
        return NextResponse.json(
          { error: access.message, code: access.code, locked: true },
          { status: 403 },
        );
      }

      if (accessRollNumber) {
        await syncStudentRollNumberPrisma(userId, accessRollNumber);
      }

      if (isElevateXTestId(testId)) {
        const prior = await findCompletedElevateXAttempt({ userId, rollNumber: accessRollNumber });
        if (prior) {
          return NextResponse.json(
            {
              error:
                'You have already submitted ElevateX. Each roll number may attempt this exam only once.',
              attemptId: prior.id,
              priorAttempt: prior,
            },
            { status: 409 },
          );
        }
      }
    }

    let durationSec = 0;
    if (testId) {
      const dbTest = await prisma.test.findFirst({
        where: { id: testId },
        select: { duration: true, durationMinutes: true },
      });
      if (dbTest) {
        const mins = Number(dbTest.duration ?? dbTest.durationMinutes ?? 0);
        durationSec = Number.isFinite(mins) && mins > 0 ? mins * 60 : 0;
      } else {
        const fer = await prisma.facultyExamRequest.findFirst({
          where: { publishedTestId: testId, status: 'approved' },
          select: { durationMinutes: true },
        });
        const mins = Number(fer?.durationMinutes ?? 0);
        durationSec = Number.isFinite(mins) && mins > 0 ? mins * 60 : 0;
      }
    }

    const answersForDb = sanitizeAnswersForPersist(answersIn);

    const finalized = await finalizeTestAttemptPrisma({
      userId,
      testId,
      testName,
      scorePercent,
      rawNetScore,
      answers: answersForDb,
      submittedAtIso: nowIso,
      attemptId,
      durationSec,
      proctorSessionId,
      proctorViolations,
      proctorAutoSubmit,
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

    if (isElevateXTestId(testId)) {
      try {
        await reconcileElevateXStaleInProgressPrisma();
      } catch (err) {
        console.warn('[test-attempts/submit] elevatex reconcile skipped:', err);
      }
    }

    try {
      await releaseStudentSessionPrisma(userId);
    } catch (err) {
      console.warn('[test-attempts/submit] session release skipped:', err);
    }

    let attempts = await fetchStudentDashboardStatsPrisma(userId);
    if (!attempts.some((row) => String(row.id) === String(id))) {
      attempts = await fetchAttemptsForUserPrisma(userId);
    }
    const saved = attempts.find((row) => String(row.id) === String(id));
    const attempt: TestAttempt & { test: { name: string } } = saved ?? {
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

    return NextResponse.json({ id, attempt, attempts });
  } catch (error) {
    return submitErrorResponse(error, submittedTestId);
  }
}
