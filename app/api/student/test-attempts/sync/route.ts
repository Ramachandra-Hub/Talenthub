import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { fallbackTestForAttempt, normalizeAttemptRow } from '@/lib/test-attempts';
import {
  syncTestAttemptReportPrisma,
  withPrismaRetry,
} from '@/lib/db/test-attempts-prisma';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';
import { slimAnswersForSubmit } from '@/lib/exam-v2/sanitize-answers';
import type { TestAttempt } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Lightweight submit fallback — minimal RDS write + dashboard stat for admin reports. */
export async function POST(request: Request) {
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

    const userId = auth.ctx.user.id;
    const nowIso = new Date().toISOString();
    const testId = String(body.testId ?? '').trim();
    const testName = typeof body.testName === 'string' ? body.testName : 'Practice test';
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : undefined;
    const elapsedSec = Number(body.elapsedSec) || 0;
    const totalQuestions = Number(body.totalQuestions) || 0;
    const answersIn =
      body.answers != null && typeof body.answers === 'object'
        ? slimAnswersForSubmit(body.answers as Record<string, unknown>)
        : undefined;

    const finalized = await withPrismaRetry(
      () =>
        syncTestAttemptReportPrisma({
          userId,
          testId,
          testName,
          scorePercent,
          elapsedSec,
          completedAtIso: nowIso,
          attemptId,
          totalQuestions: totalQuestions || undefined,
          answers: answersIn,
        }),
      2,
    );

    void releaseStudentSessionPrisma(userId).catch(() => undefined);

    const attempt: TestAttempt & { test: { name: string } } = {
      ...normalizeAttemptRow({
        id: finalized.id,
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
          id: finalized.id,
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
        name: testName,
      },
    };

    return NextResponse.json({
      id: finalized.id,
      attempt,
      attempts: [attempt],
      synced: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('[test-attempts/sync]', message, error);
    return NextResponse.json(
      {
        error: 'Could not sync your attempt to the server.',
        code: 'submit_sync_failed',
        retryable: true,
      },
      { status: 503 },
    );
  }
}
