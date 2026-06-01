import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  fallbackTestForAttempt,
  normalizeAttemptRow,
  type PersistAttemptInput,
} from '@/lib/test-attempts';
import {
  appendStudentDashboardStatPrisma,
  buildStatEntry as buildStatEntryPrisma,
  fetchStudentDashboardStatsPrisma,
} from '@/lib/db/student-dashboard-stats-prisma';
import {
  ensureStudentUserRowPrisma,
  fetchAttemptsForUserPrisma,
  findCompletedAttemptForTestPrisma,
  persistTestAttemptPrisma,
  resolveStudentProfilePrisma,
  linkProctorViolationsPrisma,
  syncStudentRollNumberPrisma,
} from '@/lib/db/test-attempts-prisma';
import { assertStudentCanTakeTestPrisma } from '@/lib/db/exam-access-prisma';
import type { TestAttempt } from '@/lib/types';
import { isElevateXTestId } from '@/lib/elevatex';
import { findCompletedElevateXAttempt } from '@/lib/elevatex/completed-attempt';
import { rollNumberFromUser } from '@/lib/admin/roll-number';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(undefined, request);
  if ('response' in auth) return auth.response;

  const userId = auth.ctx.user.id;
  let attempts = await fetchStudentDashboardStatsPrisma(userId);
  if (!attempts.length) {
    attempts = await fetchAttemptsForUserPrisma(userId);
  }
  return NextResponse.json({ attempts });
}

export async function POST(request: Request) {
  const auth = await requireAuth(undefined, request);
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

  const totalQuestions = Number(body.totalQuestions) || 0;
  const answersIn =
    body.answers != null && typeof body.answers === 'object'
      ? (body.answers as Record<string, unknown>)
      : {};

  const input: PersistAttemptInput = {
    userId,
    testId: String(body.testId ?? ''),
    testName,
    scorePercent,
    rawNetScore: Number(body.rawNetScore) || 0,
    answers: answersIn,
    elapsedSec: Number(body.elapsedSec) || 0,
    startedAtIso: typeof body.startedAtIso === 'string' ? body.startedAtIso : nowIso,
    completedAtIso: typeof body.completedAtIso === 'string' ? body.completedAtIso : nowIso,
    proctorSessionId:
      typeof body.proctorSessionId === 'string' ? body.proctorSessionId : undefined,
    proctorViolations: Number(body.proctorViolations) || 0,
    proctorAutoSubmit: Boolean(body.proctorAutoSubmit),
  };

  const testId = String(body.testId ?? '').trim();

  await ensureStudentUserRowPrisma({
    id: userId,
    email: auth.ctx.user.email,
  });

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
    const accessRollNumber =
      typeof body.accessRollNumber === 'string' && body.accessRollNumber.trim()
        ? body.accessRollNumber.trim()
        : (profile.roll_number ??
          (profile.email ? rollNumberFromUser(profile.email) : undefined));
    const access = await assertStudentCanTakeTestPrisma(userId, testId, {
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

    const prior = isElevateXTestId(testId)
      ? await findCompletedElevateXAttempt({ userId, rollNumber: accessRollNumber })
      : await findCompletedAttemptForTestPrisma(userId, testId);
    if (prior) {
      return NextResponse.json(
        {
          error: isElevateXTestId(testId)
            ? 'You have already submitted ElevateX. Each roll number may attempt this exam only once.'
            : 'You have already submitted this test and cannot take it again.',
          attemptId: prior.id,
          priorAttempt: prior,
        },
        { status: 409 },
      );
    }
  }

  const statEntry = buildStatEntryPrisma({
    id: `pending-${Date.now()}`,
    userId,
    testId: input.testId,
    testName: input.testName ?? 'Practice test',
    scorePercent,
    elapsedSec: input.elapsedSec,
    completedAtIso: input.completedAtIso,
    totalQuestions: totalQuestions || undefined,
    answers: Object.keys(answersIn).length > 0 ? answersIn : undefined,
  });

  try {
    const { id } = await persistTestAttemptPrisma(input);
    statEntry.id = id;

    if (input.proctorSessionId) {
      await linkProctorViolationsPrisma(
        userId,
        id,
        input.testId || null,
        input.proctorSessionId,
      );
    }

    await appendStudentDashboardStatPrisma(userId, statEntry);
    const attempts = await fetchStudentDashboardStatsPrisma(userId);
    const saved = attempts.find((row) => String(row.id) === String(id));
    const attempt: TestAttempt & { test: { name: string } } = saved ?? {
      ...normalizeAttemptRow({
        id,
        user_id: userId,
        test_id: input.testId,
        score: input.scorePercent,
        percentage_score: input.scorePercent,
        status: 'completed',
        created_at: input.completedAtIso,
        completed_at: input.completedAtIso,
        started_at: input.startedAtIso,
        time_taken: input.elapsedSec,
        test_title: input.testName,
      }),
      test: {
        ...fallbackTestForAttempt({
          id,
          user_id: userId,
          test_id: input.testId,
          started_at: input.startedAtIso,
          completed_at: input.completedAtIso,
          score: input.scorePercent,
          answers: null,
          time_taken: input.elapsedSec,
          status: 'completed',
          created_at: input.completedAtIso,
        }),
        name: input.testName ?? 'Practice test',
      },
    };

    return NextResponse.json({ id, attempt, attempts });
  } catch (error) {
    try {
      await appendStudentDashboardStatPrisma(userId, statEntry);
      const attempts = await fetchStudentDashboardStatsPrisma(userId);
      return NextResponse.json({
        id: statEntry.id,
        attempts,
        warning: 'Saved to dashboard stats; test_attempts row may be missing.',
      });
    } catch {
      const message = error instanceof Error ? error.message : 'Failed to save attempt';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
}
