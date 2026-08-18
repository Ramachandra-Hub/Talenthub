import { answersMatchMcq, isCodingQuestion } from '@/lib/practice-mappers';
import { roundScorePercent } from '@/lib/format-score';
import type { Question } from '@/lib/types';
import type { TestSectionConfig } from '@/lib/exam-v2/section-timer';

export type SectionScoreResult = {
  sectionId: string;
  name: string;
  rawScore: number;
  maxScore: number;
  percent: number;
  passedCutoff: boolean;
  cutoffScore: number | null;
};

export function scoreMcqWithNegativeMarking(
  questions: Question[],
  answers: Record<string, { userAnswer?: string | null }>,
  negativeMarking = 0,
): { correct: number; wrong: number; skipped: number; netScore: number; maxScore: number } {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const q of questions) {
    const ua = answers[q.id]?.userAnswer;
    if (isCodingQuestion(q)) {
      // Client cannot compile/run hidden tests. Leave coding unscored until the server grades.
      skipped++;
      continue;
    }
    if (ua === null || ua === undefined || ua === '') {
      skipped++;
      continue;
    }
    if (answersMatchMcq(ua, q.correct_answer)) {
      correct++;
    } else {
      wrong++;
    }
  }

  const maxScore = questions.length;
  const netScore = Math.max(0, correct - wrong * negativeMarking);
  return { correct, wrong, skipped, netScore, maxScore };
}

export function scoreBySections(
  sections: TestSectionConfig[],
  questionsBySection: Map<string, Question[]>,
  answers: Record<string, { userAnswer?: string | null }>,
): { sections: SectionScoreResult[]; totalNet: number; totalMax: number; overallPercent: number } {
  const results: SectionScoreResult[] = [];
  let totalNet = 0;
  let totalMax = 0;

  for (const section of sections) {
    const qs = questionsBySection.get(section.id) ?? [];
    const neg = section.negativeMarking ?? 0;
    const { netScore, maxScore } = scoreMcqWithNegativeMarking(qs, answers, neg);
    const percent = roundScorePercent(maxScore > 0 ? (netScore / maxScore) * 100 : 0);
    const cutoff = section.cutoffScore ?? null;
    const passedCutoff = cutoff === null || percent >= cutoff;

    results.push({
      sectionId: section.id,
      name: section.name,
      rawScore: netScore,
      maxScore,
      percent,
      passedCutoff,
      cutoffScore: cutoff,
    });
    totalNet += netScore;
    totalMax += maxScore;
  }

  return {
    sections: results,
    totalNet,
    totalMax,
    overallPercent: roundScorePercent(totalMax > 0 ? (totalNet / totalMax) * 100 : 0),
  };
}
