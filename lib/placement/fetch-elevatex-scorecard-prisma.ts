import { prisma } from '@/lib/prisma';
import {
  backfillElevateXScorecardToAttemptPrisma,
  findElevateXScorecardByRoll,
  findElevateXScorecardForUserId,
} from '@/lib/placement/elevatex-scorecard-recovery';
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
  | {
      scorecard: PlacementScorecard;
      attemptId: string;
      userId: string;
      source?: string;
    }
  | { error: string; status: number };

export async function fetchElevateXScorecardForAttemptPrisma(
  attemptId: string,
  options?: { rollNumber?: string },
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
        return {
          scorecard,
          attemptId: row.id,
          userId: row.userId,
          source: 'attempt_row',
        };
      }

      const fromUser = await findElevateXScorecardForUserId(row.userId);
      if (fromUser) {
        return {
          scorecard: fromUser.scorecard,
          attemptId: row.id,
          userId: row.userId,
          source: fromUser.source,
        };
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
        return {
          scorecard,
          attemptId: String(entry.id),
          userId: stat.userId,
          source: 'dashboard_stats',
        };
      }
      const fromUser = await findElevateXScorecardForUserId(stat.userId);
      if (fromUser) {
        return {
          scorecard: fromUser.scorecard,
          attemptId: String(entry.id),
          userId: stat.userId,
          source: fromUser.source,
        };
      }
    }
  }

  const roll = options?.rollNumber?.trim();
  if (roll) {
    const byRoll = await findElevateXScorecardByRoll(roll);
    if (byRoll) {
      return {
        scorecard: byRoll.scorecard,
        attemptId: byRoll.attemptId,
        userId: byRoll.userId,
        source: byRoll.source,
      };
    }
  }

  if (!isPlaceholderAttemptId(attemptId)) {
    const backfill = await backfillElevateXScorecardToAttemptPrisma(attemptId);
    if (backfill.ok) {
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
      const scorecard = row ? parseElevateXScorecardFromAnswers(row.answers) : null;
      if (scorecard && row) {
        return {
          scorecard,
          attemptId: row.id,
          userId: row.userId,
          source: `auto_backfill:${backfill.source}`,
        };
      }
    }
  }

  return {
    error:
      'ElevateX section report is not available yet. Ask the student to submit again while online, or use Admin → recover by roll number.',
    status: 404,
  };
}
