import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { elevateXTestAttemptWhere } from '@/lib/elevatex/exam-window';
import {
  encodeElevateXScorecardAnswers,
  isElevateXAttemptMeta,
  parseElevateXScorecardFromAnswers,
} from '@/lib/placement/scorecard-payload';
import type { PlacementScorecard } from '@/lib/placement/types';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';
import { isPlaceholderAttemptId } from '@/lib/test-attempts';

function parseStatAttempts(raw: unknown): DashboardStatEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is DashboardStatEntry => {
    if (!row || typeof row !== 'object') return false;
    const o = row as DashboardStatEntry;
    return Boolean(o.id && o.user_id);
  });
}

export type ScorecardHit = {
  scorecard: PlacementScorecard;
  attemptId: string;
  userId: string;
  source: 'test_attempts' | 'dashboard_stats' | 'sibling_attempt';
};

/** Find any stored ElevateX scorecard for a user (newest first). */
export async function findElevateXScorecardForUserId(
  userId: string,
): Promise<ScorecardHit | null> {
  const attempts = await prisma.testAttempt.findMany({
    where: {
      userId,
      ...elevateXTestAttemptWhere(),
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    take: 30,
    select: { id: true, userId: true, answers: true, testId: true, testTitle: true },
  });

  for (const row of attempts) {
    const scorecard = parseElevateXScorecardFromAnswers(row.answers);
    if (scorecard) {
      return {
        scorecard,
        attemptId: row.id,
        userId: row.userId,
        source: 'test_attempts',
      };
    }
  }

  const stat = await prisma.studentDashboardStat.findUnique({
    where: { userId_statKey: { userId, statKey: 'attempts_feed' } },
    select: { payload: true },
  });
  if (!stat) return null;

  for (const entry of parseStatAttempts(stat.payload)) {
    if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) continue;
    const scorecard = parseElevateXScorecardFromAnswers(entry.answers);
    if (scorecard) {
      return {
        scorecard,
        attemptId: String(entry.id),
        userId,
        source: 'dashboard_stats',
      };
    }
  }

  return null;
}

export async function findElevateXScorecardByRoll(rollNumber: string): Promise<ScorecardHit | null> {
  const roll = rollNumber.replace(/\s+/g, '').toUpperCase();
  if (!roll) return null;

  const users = await prisma.user.findMany({
    where: { rollNumber: roll },
    select: { id: true },
    take: 5,
  });

  for (const user of users) {
    const hit = await findElevateXScorecardForUserId(user.id);
    if (hit) return hit;
  }

  const attempts = await prisma.testAttempt.findMany({
    where: elevateXTestAttemptWhere(),
    orderBy: { completedAt: 'desc' },
    take: 500,
    select: { id: true, userId: true, answers: true },
  });

  for (const row of attempts) {
    const scorecard = parseElevateXScorecardFromAnswers(row.answers);
    if (!scorecard) continue;
    const ticket = scorecard.candidate.hallTicket?.replace(/\s+/g, '').toUpperCase();
    if (ticket === roll) {
      return {
        scorecard,
        attemptId: row.id,
        userId: row.userId,
        source: 'test_attempts',
      };
    }
  }

  return null;
}

/** Attach scorecard payload from client submit onto an attempt row. */
export async function attachElevateXScorecardToAttemptPrisma(
  userId: string,
  attemptId: string,
  answers: Record<string, unknown>,
): Promise<boolean> {
  if (isPlaceholderAttemptId(attemptId)) return false;
  const scorecard = parseElevateXScorecardFromAnswers(answers);
  if (!scorecard) return false;

  const encoded = encodeElevateXScorecardAnswers(
    scorecard,
    answers.__proctor && typeof answers.__proctor === 'object'
      ? { __proctor: answers.__proctor as Record<string, unknown> }
      : undefined,
  );
  const pct = scorecard.percentage;

  const updated = await prisma.testAttempt.updateMany({
    where: { id: attemptId, userId },
    data: {
      answers: encoded as Prisma.InputJsonValue,
      status: 'completed',
      completedAt: new Date(),
      percentageScore: pct,
      score: pct,
    },
  });
  return updated.count > 0;
}

/** Copy scorecard JSON onto a specific attempt row (admin repair). */
export async function backfillElevateXScorecardToAttemptPrisma(
  targetAttemptId: string,
): Promise<
  | { ok: true; source: string; attemptId: string; userId: string }
  | { ok: false; error: string }
> {
  if (isPlaceholderAttemptId(targetAttemptId)) {
    return { ok: false, error: 'Cannot backfill a local-only attempt id.' };
  }

  const target = await prisma.testAttempt.findUnique({
    where: { id: targetAttemptId },
    select: {
      id: true,
      userId: true,
      testId: true,
      testTitle: true,
      answers: true,
      status: true,
      percentageScore: true,
      score: true,
    },
  });

  if (!target || !isElevateXAttemptMeta(target.testId, target.testTitle)) {
    return { ok: false, error: 'Target is not an ElevateX attempt.' };
  }

  const existing = parseElevateXScorecardFromAnswers(target.answers);
  if (existing) {
    return {
      ok: true,
      source: 'already_on_attempt',
      attemptId: target.id,
      userId: target.userId,
    };
  }

  const hit = await findElevateXScorecardForUserId(target.userId);
  if (!hit) {
    return {
      ok: false,
      error:
        'No scorecard found for this student in the database. They must open the exam, finish, and click Submit while online.',
    };
  }

  const encoded = encodeElevateXScorecardAnswers(hit.scorecard);
  const pct = hit.scorecard.percentage;

  await prisma.testAttempt.update({
    where: { id: target.id },
    data: {
      answers: encoded as Prisma.InputJsonValue,
      status: 'completed',
      completedAt: new Date(),
      percentageScore: pct,
      score: pct,
    },
  });

  return {
    ok: true,
    source: `copied_from_${hit.source}:${hit.attemptId}`,
    attemptId: target.id,
    userId: target.userId,
  };
}
