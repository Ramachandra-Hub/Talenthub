import type { TestAnswer } from '@/app/tests/take/[testId]/test-context';
import { isCodingAnswerCorrectOnServer } from '@/lib/exam-v2/grade-coding-server';
import { loadQuestionsForScoringCached } from '@/lib/exam-v2/question-score-cache';
import { answersMatchMcq, isCodingQuestion } from '@/lib/practice-mappers';
import { roundScorePercent } from '@/lib/format-score';
import type { Question } from '@/lib/types';

function answersMapToRecord(
  answers: Record<string, unknown>,
): Record<string, TestAnswer> {
  const out: Record<string, TestAnswer> = {};
  for (const [questionId, raw] of Object.entries(answers)) {
    if (questionId.startsWith('__')) continue;
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

type ScoreOptions = {
  /** Skip Piston/Wandbox on submit — use client score for coding items (fast, reliable). */
  skipCodingExecution?: boolean;
};

/** Recompute score on server so clients never need correct_answer in the browser. */
export async function computeServerScorePercent(
  testId: string,
  answers: Record<string, unknown>,
  options?: ScoreOptions,
): Promise<{ scorePercent: number; rawNetScore: number; totalQuestions: number } | null> {
  const questions = await loadQuestionsForScoringCached(testId);
  if (!questions.length) return null;
  const answerMap = answersMapToRecord(answers);

  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const q of questions as Question[]) {
    const ua = answerMap[q.id]?.userAnswer;
    if (isCodingQuestion(q)) {
      if (options?.skipCodingExecution || ua == null || String(ua).trim() === '') {
        skipped++;
        continue;
      }
      try {
        const pass = await isCodingAnswerCorrectOnServer(q, ua);
        if (pass) correct++;
        else wrong++;
      } catch {
        skipped++;
      }
      continue;
    }
    if (ua === null || ua === undefined || ua === '') {
      skipped++;
      continue;
    }
    if (answersMatchMcq(ua, q.correct_answer)) correct++;
    else wrong++;
  }

  const maxScore = questions.length;
  const netScore = Math.max(0, correct);
  const scorePercent =
    maxScore > 0 ? roundScorePercent((netScore / maxScore) * 100) : 0;
  return { scorePercent, rawNetScore: netScore, totalQuestions: questions.length };
}
