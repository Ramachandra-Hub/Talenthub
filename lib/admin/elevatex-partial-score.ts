import { parseElevateXScorecardFromAnswers } from '@/lib/placement/scorecard-payload';
import { resolveStoredPercent } from '@/lib/test-attempts';

function partialFromAnswersPayload(answers: unknown): number {
  if (!answers || typeof answers !== 'object') return 0;
  const o = answers as Record<string, unknown>;
  for (const key of ['__placement', '__exam_progress'] as const) {
    const block = o[key];
    if (!block || typeof block !== 'object') continue;
    const pct = (block as { partialScorePercent?: unknown }).partialScorePercent;
    if (typeof pct === 'number' && Number.isFinite(pct) && pct >= 0) return pct;
  }
  return 0;
}

/** Best-effort live % from DB columns, scorecard JSON, or progress autosave payload. */
export function livePartialScoreFromAttemptRow(row: {
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

  return partialFromAnswersPayload(row.answers);
}

/** @deprecated Use livePartialScoreFromAttemptRow */
export function elevateXPartialScoreFromAttemptRow(row: {
  answers?: unknown;
  percentageScore?: number | null;
  score?: number | null;
  totalScore?: number | null;
}): number {
  return livePartialScoreFromAttemptRow(row);
}
