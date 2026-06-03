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
import { findCompletedElevateXAttempt } from '@/lib/elevatex/completed-attempt';
import { isElevateXTestId } from '@/lib/elevatex';
import { rollNumberFromUser } from '@/lib/admin/roll-number';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const testId = String(body.testId ?? '').trim();
  const scorePercent = Number(body.scorePercent);
  if (!testId || !Number.isFinite(scorePercent)) {
    return NextResponse.json({ error: 'testId and scorePercent are required' }, { status: 400 });
  }

  const userId = auth.ctx.user.id;
  const nowIso = new Date().toISOString();
  const testName = typeof body.testName === 'string' ? body.testName : 'Live exam';
  const elapsedSec = Number(body.elapsedSec) || 0;
  const answers =
    body.answers != null && typeof body.answers === 'object'
      ? (body.answers as Record<string, unknown>)
      : {};
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
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
    startedAtIso: typeof body.startedAtIso === 'string' ? body.startedAtIso : nowIso,
    proctorSessionId: proctorSessionId || undefined,
    proctorViolationCount,
  });

  return NextResponse.json({ id: result.id });
}
