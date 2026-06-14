import { prisma } from '@/lib/prisma';
import { averageScorePercent, roundScorePercent } from '@/lib/format-score';
import { resolveStoredPercent } from '@/lib/test-attempts';

export type StudentScoreStats = {
  attempt_count: number;
  completed_count: number;
  best_score: number;
  avg_score: number;
};

function scoreFromAttempt(row: {
  score: { toNumber?: () => number } | number | null;
  percentageScore: { toNumber?: () => number } | number | null;
  totalScore: { toNumber?: () => number } | number | null;
}): number {
  const num = (v: { toNumber?: () => number } | number | null) =>
    v == null ? null : typeof v === 'number' ? v : Number(v);
  return resolveStoredPercent(
    num(row.percentageScore),
    num(row.score),
    num(row.totalScore),
  );
}

/** Best / average scores per student for admin Users tab filters. */
export async function loadStudentScoreStatsMap(
  userIds: string[],
): Promise<Map<string, StudentScoreStats>> {
  const out = new Map<string, StudentScoreStats>();
  if (!userIds.length) return out;

  const chunkSize = 500;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const rows = await prisma.testAttempt.findMany({
      where: { userId: { in: chunk } },
      select: {
        userId: true,
        status: true,
        completedAt: true,
        score: true,
        percentageScore: true,
        totalScore: true,
      },
    });

    const byUser = new Map<string, number[]>();
    for (const row of rows) {
      const status = String(row.status ?? '').toLowerCase();
      const done =
        status === 'completed' ||
        status === 'submitted' ||
        row.completedAt != null;
      if (!done) continue;
      const score = scoreFromAttempt(row);
      const list = byUser.get(row.userId) ?? [];
      list.push(score);
      byUser.set(row.userId, list);
    }

    for (const [userId, scores] of byUser) {
      out.set(userId, {
        attempt_count: scores.length,
        completed_count: scores.length,
        best_score: scores.length ? Math.max(...scores) : 0,
        avg_score: scores.length ? averageScorePercent(scores) : 0,
      });
    }
  }

  return out;
}

export function matchesScoreFilter(
  stats: StudentScoreStats | undefined,
  scoreInput: string,
  mode: 'min' | 'exact',
): boolean {
  const raw = scoreInput.trim();
  if (!raw) return true;
  const target = Number(raw);
  if (!Number.isFinite(target)) return true;
  if (!stats || stats.completed_count === 0) return false;

  const best = roundScorePercent(stats.best_score);
  const targetRounded = roundScorePercent(target);
  if (mode === 'exact') {
    return Math.abs(best - targetRounded) < 0.01;
  }
  return best >= targetRounded;
}
