import { prisma } from '@/lib/prisma';
import {
  COMPETITIVE_ALL_INDIA_TEST_ID,
  getCompetitiveAllIndiaTestMeta,
} from '@/lib/competitive-exam/exam-definition';
import { upsertExamProgressPrisma } from '@/lib/db/test-attempts-prisma';

export const COMPETITIVE_SEED_META_KEY = '__competitiveSeed';

function newSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readCompetitiveSeedFromAnswers(
  answers: unknown,
): string | null {
  if (!answers || typeof answers !== 'object') return null;
  const seed = (answers as Record<string, unknown>)[COMPETITIVE_SEED_META_KEY];
  return typeof seed === 'string' && seed.trim() ? seed.trim() : null;
}

export async function resolveCompetitiveSeedFromAttempt(
  userId: string,
): Promise<string | null> {
  const open = await prisma.testAttempt.findFirst({
    where: {
      userId,
      testId: COMPETITIVE_ALL_INDIA_TEST_ID,
      status: { in: ['in_progress', 'started', 'active'] },
      completedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { answers: true },
  });
  return readCompetitiveSeedFromAnswers(open?.answers);
}

export async function getOrCreateCompetitiveSeedPrisma(
  userId: string,
  _requestedSeed?: string,
): Promise<{ seed: string; attemptId: string; resumed: boolean }> {
  const existing = await resolveCompetitiveSeedFromAttempt(userId);
  if (existing) {
    const row = await prisma.testAttempt.findFirst({
      where: {
        userId,
        testId: COMPETITIVE_ALL_INDIA_TEST_ID,
        status: { in: ['in_progress', 'started', 'active'] },
        completedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return {
      seed: existing,
      attemptId: row?.id ?? '',
      resumed: true,
    };
  }

  const seed = newSeed();
  const meta = getCompetitiveAllIndiaTestMeta();
  const progress = await upsertExamProgressPrisma({
    userId,
    testId: COMPETITIVE_ALL_INDIA_TEST_ID,
    testName: meta.name,
    scorePercent: 0,
    elapsedSec: 0,
    answers: { [COMPETITIVE_SEED_META_KEY]: seed },
    startedAtIso: new Date().toISOString(),
  });

  return { seed, attemptId: progress.id, resumed: false };
}
