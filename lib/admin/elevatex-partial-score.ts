import { parseElevateXScorecardFromAnswers } from '@/lib/placement/scorecard-payload';
import { resolveStoredPercent } from '@/lib/test-attempts';

/** Best-effort live % from DB columns, scorecard JSON, or placement progress autosave. */
export function elevateXPartialScoreFromAttemptRow(row: {
  answers?: unknown;
  percentageScore?: number | null;
  score?: number | null;
  totalScore?: number | null;
}): number {
  const scorecard = parseElevateXScorecardFromAnswers(row.answers);
  if (scorecard && typeof scorecard.percentage === 'number') {
    return scorecard.percentage;
  }

  const fromColumns = resolveStoredPercent(
    row.percentageScore != null ? Number(row.percentageScore) : null,
    row.score != null ? Number(row.score) : null,
    row.totalScore != null ? Number(row.totalScore) : null,
  );
  if (fromColumns > 0) return fromColumns;

  if (row.answers && typeof row.answers === 'object') {
    const placement = (row.answers as Record<string, unknown>).__placement;
    if (placement && typeof placement === 'object') {
      const pct = (placement as { partialScorePercent?: unknown }).partialScorePercent;
      if (typeof pct === 'number' && Number.isFinite(pct)) return pct;
    }
  }

  return 0;
}
