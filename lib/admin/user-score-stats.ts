import { getDbService } from '@/lib/db/get-db-service';
import { loadAllAttemptsRollup } from '@/lib/admin/attempts-rollup';
import { isCompletedAttemptStatus } from '@/lib/attempt-status';
import { averageScorePercent, roundScorePercent } from '@/lib/format-score';

export type StudentScoreStats = {
  attempt_count: number;
  completed_count: number;
  best_score: number;
  avg_score: number;
};

/** Best / average scores per student — same attempt rollup as admin reports. */
export async function loadStudentScoreStatsMap(
  userIds: string[],
): Promise<Map<string, StudentScoreStats>> {
  const out = new Map<string, StudentScoreStats>();
  if (!userIds.length) return out;

  const admin = getDbService();
  if (!admin) return out;

  const idSet = new Set(userIds);
  const { attempts } = await loadAllAttemptsRollup(admin);
  const byUser = new Map<string, number[]>();
  const completedByUser = new Map<string, number>();

  for (const attempt of attempts) {
    if (!idSet.has(attempt.user_id)) continue;

    const score = roundScorePercent(Number(attempt.score));
    if (!Number.isFinite(score)) continue;

    const scores = byUser.get(attempt.user_id) ?? [];
    scores.push(score);
    byUser.set(attempt.user_id, scores);

    if (isCompletedAttemptStatus(attempt.status, attempt.completed_at)) {
      completedByUser.set(
        attempt.user_id,
        (completedByUser.get(attempt.user_id) ?? 0) + 1,
      );
    }
  }

  for (const [userId, scores] of byUser) {
    if (!scores.length) continue;
    out.set(userId, {
      attempt_count: scores.length,
      completed_count: completedByUser.get(userId) ?? 0,
      best_score: Math.max(...scores),
      avg_score: averageScorePercent(scores),
    });
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
  if (!stats || stats.attempt_count === 0) return false;

  const best = roundScorePercent(stats.best_score);
  const avg = roundScorePercent(stats.avg_score);
  const targetRounded = roundScorePercent(target);

  if (mode === 'exact') {
    return (
      Math.abs(best - targetRounded) <= 0.5 || Math.abs(avg - targetRounded) <= 0.5
    );
  }
  return best >= targetRounded - 0.001;
}
