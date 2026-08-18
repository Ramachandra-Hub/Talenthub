import type { TestAnswer } from '@/app/tests/take/[testId]/test-context';
import { gradeCodingAnswerOnServer } from '@/lib/exam-v2/grade-coding-server';
import { loadQuestionsForScoringCached } from '@/lib/exam-v2/question-score-cache';
import { answersMatchMcq, isCodingQuestion } from '@/lib/practice-mappers';
import { roundScorePercent } from '@/lib/format-score';
import type { Question } from '@/lib/types';

export type QuestionScoreResult = {
  questionId: string;
  earned: number;
  correct: boolean;
  wrong: boolean;
  skipped: boolean;
  isCoding: boolean;
};

function answersMapToRecord(
  answers: Record<string, unknown>,
): Record<string, TestAnswer> {
  const out: Record<string, TestAnswer> = {};
  for (const [questionId, raw] of Object.entries(answers)) {
    if (questionId.startsWith('__') || questionId === '_type' || questionId === 'scorecard') continue;
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    out[questionId] = {
      questionId,
      userAnswer:
        typeof row.userAnswer === 'string'
          ? row.userAnswer
          : row.userAnswer == null
            ? null
            : String(row.userAnswer),
      isMarkedForReview: Boolean(row.isMarkedForReview),
    };
  }
  return out;
}

/** Recompute score on server so clients never need correct_answer in the browser. */
export async function scoreQuestionsOnServer(
  testId: string,
  answers: Record<string, unknown>,
): Promise<{
  results: QuestionScoreResult[];
  questions: Question[];
  scorePercent: number;
  rawNetScore: number;
  totalQuestions: number;
} | null> {
  const questions = await loadQuestionsForScoringCached(testId);
  if (!questions.length) return null;
  const answerMap = answersMapToRecord(answers);
  const results: QuestionScoreResult[] = [];
  let earned = 0;

  for (const q of questions as Question[]) {
    const ua = answerMap[q.id]?.userAnswer;
    if (isCodingQuestion(q)) {
      const grade = await gradeCodingAnswerOnServer(q, ua);
      const hasCode = Boolean(ua && String(ua).trim());
      results.push({
        questionId: q.id,
        earned: grade.fraction,
        correct: grade.fraction === 1,
        wrong: hasCode && grade.fraction < 1,
        skipped: !hasCode,
        isCoding: true,
      });
      earned += grade.fraction;
      continue;
    }
    if (ua === null || ua === undefined || ua === '') {
      results.push({
        questionId: q.id,
        earned: 0,
        correct: false,
        wrong: false,
        skipped: true,
        isCoding: false,
      });
      continue;
    }
    const ok = answersMatchMcq(ua, q.correct_answer);
    results.push({
      questionId: q.id,
      earned: ok ? 1 : 0,
      correct: ok,
      wrong: !ok,
      skipped: false,
      isCoding: false,
    });
    if (ok) earned += 1;
  }

  const totalQuestions = questions.length;
  const scorePercent =
    totalQuestions > 0 ? roundScorePercent((earned / totalQuestions) * 100) : 0;
  return {
    results,
    questions: questions as Question[],
    scorePercent,
    rawNetScore: earned,
    totalQuestions,
  };
}

export async function computeServerScorePercent(
  testId: string,
  answers: Record<string, unknown>,
): Promise<{ scorePercent: number; rawNetScore: number; totalQuestions: number } | null> {
  const scored = await scoreQuestionsOnServer(testId, answers);
  if (!scored) return null;
  return {
    scorePercent: scored.scorePercent,
    rawNetScore: scored.rawNetScore,
    totalQuestions: scored.totalQuestions,
  };
}
