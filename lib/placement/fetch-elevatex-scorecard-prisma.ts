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
import { buildExamScorecard, encodeExamScorecardAnswers } from '@/lib/exams/exam-scorecard';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import type { PlacementScorecard } from '@/lib/placement/types';
import type { DashboardStatEntry } from '@/lib/student-dashboard-stats';
import { isPlaceholderAttemptId } from '@/lib/test-attempts';
import type { Prisma } from '@prisma/client';

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

async function rebuildExamScorecardForAttempt(row: {
  id: string;
  userId: string;
  testId: string | null;
  testTitle: string | null;
  answers: Prisma.JsonValue;
  startedAt: Date | null;
  completedAt: Date | null;
  timeTaken: number | null;
}): Promise<ElevateXScorecardLookupResult | null> {
  if (!row.testId) return null;
  const answers =
    row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>)
      : {};
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { fullName: true, email: true, rollNumber: true, branch: true },
  });
  const built = await buildExamScorecard({
    testId: row.testId,
    testName: row.testTitle || 'Exam',
    answers,
    candidate: {
      fullName: user?.fullName || user?.email || 'Student',
      hallTicket: user?.rollNumber || rollNumberFromUser(user?.email || ''),
      departmentId: user?.branch,
    },
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    elapsedSec: row.timeTaken ?? 0,
  });
  if (!built) return null;
  await prisma.testAttempt.update({
    where: { id: row.id },
    data: {
      score: built.scorePercent,
      percentageScore: built.scorePercent,
      totalScore: built.rawNetScore,
      answers: encodeExamScorecardAnswers(built.scorecard, answers) as Prisma.InputJsonValue,
    },
  });
  return {
    scorecard: built.scorecard,
    attemptId: row.id,
    userId: row.userId,
    source: 'recomputed',
  };
}

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
        startedAt: true,
        completedAt: true,
        timeTaken: true,
      },
    });
    if (row) {
      const scorecard = parseElevateXScorecardFromAnswers(row.answers);
      const elevateX = isElevateXAttemptMeta(row.testId, row.testTitle);
      if (!elevateX) {
        const answers =
          row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
            ? (row.answers as Record<string, unknown>)
            : {};
        const hasCoding = Object.values(answers).some((value) => {
          if (!value || typeof value !== 'object') return false;
          const ua = (value as { userAnswer?: unknown }).userAnswer;
          return typeof ua === 'string' && ua.includes('sourceCode');
        });
        const staleCard =
          !scorecard ||
          scorecard.reportKind !== 'exam' ||
          (hasCoding && scorecard.percentage >= 99);
        if (staleCard) {
          const rebuilt = await rebuildExamScorecardForAttempt(row);
          if (rebuilt) return rebuilt;
        }
        if (scorecard) {
          return {
            scorecard,
            attemptId: row.id,
            userId: row.userId,
            source: 'attempt_row',
          };
        }
        return { error: 'Exam report could not be generated for this attempt.', status: 404 };
      }

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
      const scorecard = parseElevateXScorecardFromAnswers(entry.answers);
      if (scorecard) {
        return {
          scorecard,
          attemptId: String(entry.id),
          userId: stat.userId,
          source: 'dashboard_stats',
        };
      }
      if (!isElevateXAttemptMeta(entry.test_id, entry.test_name)) {
        continue;
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
