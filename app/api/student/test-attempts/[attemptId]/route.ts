import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { scoreFromAttemptRow } from '@/lib/db/test-attempts-prisma';
import type { AttemptRow } from '@/lib/test-attempts';

type RouteContext = { params: Promise<{ attemptId: string }> };

export const dynamic = 'force-dynamic';

/** GET — confirm submission status for the result page. */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(['student', 'admin'], request);
  if ('response' in auth) return auth.response;

  const { attemptId } = await context.params;
  const id = attemptId?.trim();
  if (!id) {
    return NextResponse.json({ error: 'Attempt id required' }, { status: 400 });
  }

  if (id.startsWith('local-')) {
    return NextResponse.json({
      id,
      status: 'completed',
      confirmed: true,
      source: 'local',
      testTitle: 'Practice examination',
      scorePercent: null,
      completedAt: new Date().toISOString(),
      referenceId: id,
    });
  }

  const row = await prisma.testAttempt.findFirst({
    where:
      auth.ctx.resolved.role === 'admin'
        ? { id }
        : { id, userId: auth.ctx.user.id },
    select: {
      id: true,
      status: true,
      testTitle: true,
      testId: true,
      percentageScore: true,
      score: true,
      totalScore: true,
      completedAt: true,
      createdAt: true,
    },
  });

  if (!row) {
    return NextResponse.json({
      id,
      status: 'pending',
      confirmed: false,
      source: 'server',
      testTitle: 'Examination',
      scorePercent: null,
      completedAt: null,
      referenceId: id,
      error: 'Submission is still saving. Refresh this page in a moment.',
    });
  }

  const completed = Boolean(row.completedAt) || row.status === 'completed' || row.status === 'submitted';
  const attemptRow = row as unknown as AttemptRow;

  return NextResponse.json({
    id: row.id,
    status: row.status,
    confirmed: completed,
    source: 'server',
    testTitle: row.testTitle ?? 'Examination',
    testId: row.testId,
    scorePercent: completed ? scoreFromAttemptRow(attemptRow) : null,
    completedAt: row.completedAt?.toISOString() ?? null,
    referenceId: row.id,
  });
}
