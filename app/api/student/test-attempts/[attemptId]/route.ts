import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { scoreFromAttemptRow } from '@/lib/db/test-attempts-prisma';
import type { AttemptRow } from '@/lib/test-attempts';

type RouteContext = { params: Promise<{ attemptId: string }> };

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function pendingPayload(id: string, error?: string) {
  return {
    id,
    status: 'pending',
    confirmed: false,
    source: 'server',
    testTitle: 'Examination',
    scorePercent: null,
    completedAt: null,
    referenceId: id,
    error: error ?? 'Submission is still saving. Refresh this page in a moment.',
  };
}

/** GET — confirm submission status for the result page. Never hard-404 during exams. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(['student', 'admin'], request);
    if ('response' in auth) return auth.response;

    const { attemptId } = await context.params;
    const id = attemptId?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Attempt id required' }, { status: 400 });
    }

    if (id.startsWith('local-') || id.startsWith('pending-')) {
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

    let row = await prisma.testAttempt.findFirst({
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
        userId: true,
      },
    });

    // Ownership mismatch / race: still confirm the attempt exists so the result
    // page does not show a hard 404 while submit finishes.
    if (!row && auth.ctx.resolved.role !== 'admin') {
      row = await prisma.testAttempt.findFirst({
        where: { id },
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
          userId: true,
        },
      });
      if (row && row.userId !== auth.ctx.user.id) {
        return NextResponse.json(pendingPayload(id, 'Submission found. Confirming ownership…'));
      }
    }

    if (!row) {
      return NextResponse.json(pendingPayload(id));
    }

    const completed =
      Boolean(row.completedAt) || row.status === 'completed' || row.status === 'submitted';
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
  } catch (err) {
    console.error('[test-attempts/get]', err);
    const id = (await context.params.catch(() => ({ attemptId: '' }))).attemptId?.trim() || '';
    return NextResponse.json(pendingPayload(id || 'unknown', 'Could not verify yet. Refresh shortly.'));
  }
}
