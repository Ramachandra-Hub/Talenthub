import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  ensureStudentUserRowPrisma,
  resolveStudentProfilePrisma,
  upsertExamProgressPrisma,
} from '@/lib/db/test-attempts-prisma';
import { assertStudentCanTakeTestPrisma } from '@/lib/db/exam-access-prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAuth(undefined, request);
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
  const access = await assertStudentCanTakeTestPrisma(userId, testId, {
    branch: profile.branch,
    academic_year: profile.academic_year,
    roll_number: profile.roll_number,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message, code: access.code, locked: true },
      { status: 403 },
    );
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
