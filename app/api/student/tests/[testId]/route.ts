import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { useAwsStack } from '@/lib/aws/stack';
import { loadQuestionsForTake, loadTestRowForTake } from '@/lib/load-test-for-take';
import { loadTestSections } from '@/lib/exam-v2/load-sections';
import { requireAuth } from '@/lib/server-auth';
import { findCompletedAttemptForTest } from '@/lib/test-attempts';
import { checkStudentExamAccess } from '@/lib/exam-access';
import { resolveStudentTargeting } from '@/lib/student-profile-sync';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import {
  findCompletedAttemptForTestPrisma,
  loadQuestionsForTakePrisma,
  loadTestRowForTakePrisma,
  resolveStudentProfilePrisma,
} from '@/lib/db/test-attempts-prisma';
import { checkStudentExamAccessPrisma } from '@/lib/db/exam-access-prisma';

type RouteContext = { params: Promise<{ testId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const { testId } = await context.params;
  if (!testId?.trim()) {
    return NextResponse.json({ error: 'Test id required' }, { status: 400 });
  }

  const trimmedId = testId.trim();
  const userId = auth.ctx.user.id;

  if (useAwsStack()) {
    const test = await loadTestRowForTakePrisma(trimmedId);
    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    const profile = await resolveStudentProfilePrisma(userId);
    const access = await checkStudentExamAccessPrisma({
      testId: trimmedId,
      department: profile.branch ?? auth.ctx.resolved.department ?? '',
      year: profile.academic_year ?? auth.ctx.resolved.academicYear ?? '',
      rollNumber: profile.roll_number ?? rollNumberFromUser(profile.email ?? '', null),
    });

    if (!access.allowed) {
      return NextResponse.json(
        { error: access.message, code: access.code, locked: true },
        { status: 403 },
      );
    }

    const priorAttempt = await findCompletedAttemptForTestPrisma(userId, trimmedId);
    const questions = await loadQuestionsForTakePrisma(trimmedId);

    if (!questions.length) {
      return NextResponse.json(
        {
          error: 'This test has no questions yet. Ask your faculty or admin to republish the exam.',
          test,
          questions: [],
          sections: [],
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      test: { ...test, total_questions: questions.length },
      questions,
      sections: [],
      priorAttempt,
      schedule: access.schedule,
    });
  }

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const test = await loadTestRowForTake(admin, trimmedId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(auth.ctx.resolved.id);
  const profile = await resolveStudentTargeting(
    admin,
    auth.ctx.resolved.id,
    (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
    auth.ctx.resolved.email ?? auth.ctx.user.email,
  );
  const access = await checkStudentExamAccess(admin, {
    testId: trimmedId,
    department: profile.branch ?? auth.ctx.resolved.department ?? '',
    year: profile.academic_year ?? auth.ctx.resolved.academicYear ?? '',
    rollNumber: rollNumberFromUser(
      auth.ctx.resolved.email ?? auth.ctx.user.email,
      (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
    ),
    email: auth.ctx.resolved.email ?? auth.ctx.user.email,
    metadata: (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>,
  });

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message, code: access.code, locked: true },
      { status: 403 },
    );
  }

  const priorAttempt = await findCompletedAttemptForTest(admin, auth.ctx.user.id, trimmedId);
  const questions = await loadQuestionsForTake(admin, trimmedId);
  const sections = await loadTestSections(admin, trimmedId);

  if (!questions.length) {
    return NextResponse.json(
      {
        error: 'This test has no questions yet. Ask your faculty or admin to republish the exam.',
        test,
        questions: [],
        sections,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    test: { ...test, total_questions: questions.length },
    questions,
    sections,
    priorAttempt,
    schedule: access.schedule,
  });
}
