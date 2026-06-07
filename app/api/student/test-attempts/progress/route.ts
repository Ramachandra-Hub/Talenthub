import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  ensureStudentUserRowPrisma,
  findCompletedAttemptForTestPrisma,
  resolveStudentProfilePrisma,
  syncStudentRollNumberPrisma,
  upsertExamProgressPrisma,
} from '@/lib/db/test-attempts-prisma';
import { assertStudentCanReportProgressPrisma } from '@/lib/db/exam-access-prisma';
import { computeServerScorePercent } from '@/lib/exam-v2/server-score';
import { findCompletedElevateXAttempt } from '@/lib/elevatex/completed-attempt';
import { isElevateXTestId } from '@/lib/elevatex';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { rateLimitInMemory } from '@/lib/rate-limit';
import {
  recordExamProgressWrite,
  shouldPersistExamProgress,
} from '@/lib/exam-v2/progress-throttle';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['student'], request);
    if ('response' in auth) return auth.response;

    const userId = auth.ctx.user.id;
    const burst = rateLimitInMemory(`exam-progress:${userId}`, 12, 60_000);
    if (!burst.ok) {
      return NextResponse.json(
        {
          error: 'Progress saves are too frequent. Your answers are still saved locally.',
          retryAfterSec: burst.retryAfterSec,
          throttled: true,
        },
        { status: 429 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const testId = String(body.testId ?? '').trim();
    let scorePercent = Number(body.scorePercent);
    if (!testId) {
      return NextResponse.json({ error: 'testId is required' }, { status: 400 });
    }

    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
    const nowIso = new Date().toISOString();
    const startedAtIso =
      typeof body.startedAtIso === 'string' ? body.startedAtIso : nowIso;

    const earlyThrottle = shouldPersistExamProgress(userId, testId, attemptId || undefined);
    if (!earlyThrottle.persist) {
      return NextResponse.json({
        id: earlyThrottle.attemptId ?? attemptId ?? null,
        startedAtIso: earlyThrottle.startedAtIso ?? startedAtIso,
        scorePercent: earlyThrottle.scorePercent ?? (Number.isFinite(scorePercent) ? scorePercent : 0),
        throttled: true,
      });
    }

    const testName = typeof body.testName === 'string' ? body.testName : 'Live exam';
    const elapsedSec = Number(body.elapsedSec) || 0;
    const answers =
      body.answers != null && typeof body.answers === 'object'
        ? (body.answers as Record<string, unknown>)
        : {};

    if (Object.keys(answers).length > 0 && !isElevateXTestId(testId)) {
      const rescored = await computeServerScorePercent(testId, answers);
      if (rescored) scorePercent = rescored.scorePercent;
    } else if (!Number.isFinite(scorePercent)) {
      scorePercent = 0;
    }

    const proctorSessionId =
      typeof body.proctorSessionId === 'string' ? body.proctorSessionId.trim() : '';
    const proctorViolationCount = Number(body.proctorViolationCount) || 0;

    await ensureStudentUserRowPrisma({ id: userId, email: auth.ctx.user.email });
    const profile = await resolveStudentProfilePrisma(userId);
    const accessBranch =
      typeof body.accessBranch === 'string' && body.accessBranch.trim()
        ? body.accessBranch.trim()
        : (profile.branch ?? '');
    const accessYear =
      typeof body.accessYear === 'string' && body.accessYear.trim()
        ? body.accessYear.trim()
        : (profile.academic_year ?? '');
    const accessRollNumber =
      typeof body.accessRollNumber === 'string' && body.accessRollNumber.trim()
        ? body.accessRollNumber.trim()
        : (profile.roll_number ??
          (profile.email ? rollNumberFromUser(profile.email) : undefined));
    const access = await assertStudentCanReportProgressPrisma(userId, testId, {
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
      const prior = await findCompletedElevateXAttempt({
        userId,
        rollNumber: accessRollNumber,
      });
      if (prior) {
        return NextResponse.json(
          {
            error:
              'You have already submitted ElevateX. Each roll number may attempt this exam only once.',
            attemptId: prior.id,
            priorAttempt: prior,
            locked: true,
          },
          { status: 409 },
        );
      }
    } else {
      const prior = await findCompletedAttemptForTestPrisma(userId, testId);
      if (prior) {
        return NextResponse.json(
          {
            error: 'You have already submitted this test and cannot take it again.',
            attemptId: prior.id,
            priorAttempt: prior,
            locked: true,
          },
          { status: 409 },
        );
      }
    }

    const result = await upsertExamProgressPrisma({
      userId,
      testId,
      testName,
      scorePercent,
      elapsedSec,
      answers,
      attemptId: attemptId || undefined,
      startedAtIso,
      proctorSessionId: proctorSessionId || undefined,
      proctorViolationCount,
    });

    recordExamProgressWrite({
      userId,
      testId,
      attemptId: result.id,
      startedAtIso: result.startedAtIso,
      scorePercent,
    });

    return NextResponse.json({
      id: result.id,
      startedAtIso: result.startedAtIso,
      scorePercent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Progress save failed';
    console.error('[test-attempts/progress]', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
