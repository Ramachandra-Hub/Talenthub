import { prisma } from '@/lib/prisma';
import {
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

export type ElevateXScorecardLookupResult =
  | { scorecard: PlacementScorecard; attemptId: string; userId: string }
  | { error: string; status: number };

export async function fetchElevateXScorecardForAttemptPrisma(
  attemptId: string,
): Promise<ElevateXScorecardLookupResult> {
  if (!isPlaceholderAttemptId(attemptId)) {
    const row = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        testId: true,
        testTitle: true,
        answers: true,
      },
    });
    if (row) {
      if (!isElevateXAttemptMeta(row.testId, row.testTitle)) {
        return { error: 'Not an ElevateX attempt', status: 400 };
      }
      const scorecard = parseElevateXScorecardFromAnswers(row.answers);
      if (scorecard) {
        return { scorecard, attemptId: row.id, userId: row.userId };
      }
      const { findCompletedElevateXAttemptForUser } = await import(
        '@/lib/elevatex/completed-attempt'
      );
      const fallback = await findCompletedElevateXAttemptForUser(row.userId);
      if (fallback) {
        const completedRow = await prisma.testAttempt.findUnique({
          where: { id: fallback.id },
          select: { id: true, userId: true, answers: true },
        });
        const fromCompleted = completedRow
          ? parseElevateXScorecardFromAnswers(completedRow.answers)
          : null;
        if (fromCompleted) {
          return {
            scorecard: fromCompleted,
            attemptId: completedRow!.id,
            userId: completedRow!.userId,
          };
        }
      }
    }
  }

  const stats = await prisma.studentDashboardStat.findMany({
    where: { statKey: 'attempts_feed' },
    select: { userId: true, payload: true },
    take: 5000,
  });

  for (const stat of stats) {
    for (const entry of parseStatAttempts(stat.payload)) {
      if (String(entry.id) !== attemptId) continue;
      if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) {
        return { error: 'Not an ElevateX attempt', status: 400 };
      }
      const scorecard = parseElevateXScorecardFromAnswers(entry.answers);
      if (scorecard) {
        return { scorecard, attemptId: String(entry.id), userId: stat.userId };
      }
    }
  }

  return {
    error:
      'ElevateX scorecard is not stored for this attempt. Ask the student to submit again while online, or check Vercel logs for save errors.',
    status: 404,
  };
}
