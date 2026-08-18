import { isElevateXAttemptTitle, isElevateXTestId } from '@/lib/elevatex';
import { EXAM_SCORECARD_ANSWERS_TYPE } from '@/lib/exams/exam-scorecard';
import type { PlacementScorecard } from '@/lib/placement/types';

export const ELEVATEX_SCORECARD_ANSWERS_TYPE = 'elevatex_scorecard_v1';

export function encodeElevateXScorecardAnswers(
  scorecard: PlacementScorecard,
  extras?: { __proctor?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    _type: ELEVATEX_SCORECARD_ANSWERS_TYPE,
    scorecard,
    ...(extras?.__proctor ? { __proctor: extras.__proctor } : {}),
  };
}

export function parseElevateXScorecardFromAnswers(answers: unknown): PlacementScorecard | null {
  if (!answers || typeof answers !== 'object') return null;
  const obj = answers as Record<string, unknown>;

  if (
    (obj._type === ELEVATEX_SCORECARD_ANSWERS_TYPE || obj._type === EXAM_SCORECARD_ANSWERS_TYPE) &&
    obj.scorecard
  ) {
    const scorecard = obj.scorecard as PlacementScorecard;
    if (obj._type === EXAM_SCORECARD_ANSWERS_TYPE && !scorecard.reportKind) {
      return { ...scorecard, reportKind: 'exam' };
    }
    return scorecard;
  }

  const maybe = obj as PlacementScorecard;
  if (maybe.candidate && Array.isArray(maybe.sections) && typeof maybe.percentage === 'number') {
    return maybe;
  }

  return null;
}

export function isElevateXAttemptMeta(testId?: string | null, testName?: string | null): boolean {
  return isElevateXTestId(testId) || isElevateXAttemptTitle(testName);
}
