import { prisma } from '@/lib/prisma';
import { fetchDashboardStatEntriesPrisma } from '@/lib/db/student-dashboard-stats-prisma';
import { isElevateXAttemptTitle, isElevateXTestId } from '@/lib/elevatex';
import { isPlaceholderAttemptId } from '@/lib/test-attempts';
import { roundScorePercent } from '@/lib/format-score';

export type CompletedElevateXSummary = {
  id: string;
  score: number;
  completed_at: string | null;
};

function matchesElevateX(testId: unknown, title: unknown): boolean {
  if (isElevateXTestId(String(testId ?? ''))) return true;
  return isElevateXAttemptTitle(String(title ?? ''));
}

function isCompletedRow(status: unknown, completedAt: unknown): boolean {
  const s = String(status ?? '').toLowerCase();
  if (s === 'completed' || s === 'submitted') return true;
  return completedAt != null && String(completedAt).length > 0;
}

function toScorePercent(percentage: unknown, score: unknown): number {
  const pct = percentage != null ? Number(percentage) : NaN;
  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) return roundScorePercent(pct);
  const s = score != null ? Number(score) : NaN;
  return Number.isFinite(s) ? roundScorePercent(s) : 0;
}

/** Prior completed ElevateX attempt for a student — never throws. */
export async function findCompletedElevateXAttemptForUser(
  userId: string,
): Promise<CompletedElevateXSummary | null> {
  type AttemptRow = {
    id: string;
    test_id: string | null;
    test_title?: string | null;
    percentage_score: unknown;
    score: unknown;
    completed_at: Date | null;
    status: string | null;
  };

  const queries = [
    prisma.$queryRaw<AttemptRow[]>`
      SELECT
        id,
        test_id::text AS test_id,
        test_title,
        percentage_score,
        score,
        completed_at,
        status
      FROM test_attempts
      WHERE user_id = ${userId}::uuid
        AND (
          status ILIKE 'completed'
          OR status ILIKE 'submitted'
          OR completed_at IS NOT NULL
        )
      ORDER BY completed_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 40
    `,
    prisma.$queryRaw<AttemptRow[]>`
      SELECT
        id,
        test_id::text AS test_id,
        percentage_score,
        score,
        completed_at,
        status
      FROM test_attempts
      WHERE user_id = ${userId}::uuid
        AND (
          status ILIKE 'completed'
          OR status ILIKE 'submitted'
          OR completed_at IS NOT NULL
        )
      ORDER BY completed_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 40
    `,
  ];

  for (const query of queries) {
    try {
      const rows = await query;
      for (const row of rows) {
        if (!matchesElevateX(row.test_id, row.test_title)) continue;
        if (!isCompletedRow(row.status, row.completed_at)) continue;
        return {
          id: row.id,
          score: toScorePercent(row.percentage_score, row.score),
          completed_at: row.completed_at?.toISOString() ?? null,
        };
      }
      break;
    } catch (err) {
      console.warn('[elevatex] test_attempts lookup:', err);
    }
  }

  try {
    const entries = await fetchDashboardStatEntriesPrisma(userId);
    let placeholder: CompletedElevateXSummary | null = null;
    for (const entry of entries) {
      if (!matchesElevateX(entry.test_id, entry.test_name)) continue;
      if (!isCompletedRow(entry.status, entry.completed_at)) continue;
      const summary: CompletedElevateXSummary = {
        id: entry.id,
        score: entry.score,
        completed_at: entry.completed_at,
      };
      if (!isPlaceholderAttemptId(String(entry.id))) return summary;
      if (!placeholder) placeholder = summary;
    }
    return placeholder;
  } catch (err) {
    console.warn('[elevatex] dashboard stats lookup:', err);
  }

  return null;
}
