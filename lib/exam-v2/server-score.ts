import type { TestAnswer } from '@/app/tests/take/[testId]/test-context';
import { gradeCodingAnswerOnServer } from '@/lib/exam-v2/grade-coding-server';
import type { CodingRubricReport } from '@/lib/exam-v2/coding-rubric';
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
  codingRubric?: CodingRubricReport;
  codingTitle?: string;
};

function answersMapToRecord(
  answers: Record<string, unknown>,
): Record<string, TestAnswer> {
  const out: Record<string, TestAnswer> = {};

  const toStringOrNull = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  };

  const normalizeRawAnswer = (raw: unknown): string | null => {
    // Newer shape already stores answer as a plain string.
    const direct = toStringOrNull(raw);
    if (direct !== null) return direct;
    if (!raw || typeof raw !== 'object') return null;

    const row = raw as Record<string, unknown>;

    // Primary persisted shape: { userAnswer, isMarkedForReview }.
    const fromUserAnswer = toStringOrNull(row.userAnswer);
    if (fromUserAnswer !== null) return fromUserAnswer;

    // Some legacy payloads keep coding answer directly on the row.
    const sourceCode = toStringOrNull(row.sourceCode ?? row.code);
    if (sourceCode !== null) {
      const language = toStringOrNull(row.language) ?? 'java';
      return JSON.stringify({ language, sourceCode });
    }

    // Legacy generic field aliases.
    const fromAnswer = toStringOrNull(row.answer ?? row.value);
    if (fromAnswer !== null) return fromAnswer;

    return null;
  };

  for (const [questionId, raw] of Object.entries(answers)) {
    if (questionId.startsWith('__') || questionId === '_type' || questionId === 'scorecard') continue;

    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    out[questionId] = {
      questionId,
      userAnswer: normalizeRawAnswer(raw),
      isMarkedForReview: Boolean(row?.isMarkedForReview),
    };
  }
  return out;
}

export type ScoreQuestionsOptions = {
  /**
   * Skip remote coding execution (Wandbox/Piston). Use on submit so the
   * attempt saves quickly; full coding grades run later on report open / background.
   */
  deferCoding?: boolean;
};

/** Recompute score on server so clients never need correct_answer in the browser. */
export async function scoreQuestionsOnServer(
  testId: string,
  answers: Record<string, unknown>,
  options?: ScoreQuestionsOptions,
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
  const deferCoding = Boolean(options?.deferCoding);

  for (const q of questions as Question[]) {
    const ua = answerMap[q.id]?.userAnswer;
    if (isCodingQuestion(q)) {
      const hasCode = Boolean(ua && String(ua).trim());
      if (deferCoding) {
        // Provisional row — not counted as wrong/correct until remote grade finishes.
        results.push({
          questionId: q.id,
          earned: 0,
          correct: false,
          wrong: false,
          skipped: !hasCode,
          isCoding: true,
          codingTitle: q.coding_title ?? q.coding_problem_id ?? `Coding ${q.id.slice(-4)}`,
        });
        continue;
      }
      const grade = await gradeCodingAnswerOnServer(q, ua);
      results.push({
        questionId: q.id,
        earned: grade.rubric.totalEarned / 100,
        correct: grade.rubric.totalEarned >= 99.5,
        wrong: hasCode && grade.rubric.totalEarned < 99.5,
        skipped: !hasCode,
        isCoding: true,
        codingRubric: grade.rubric,
        codingTitle: q.coding_title ?? q.coding_problem_id ?? `Coding ${q.id.slice(-4)}`,
      });
      earned += grade.rubric.totalEarned / 100;
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
  const scoredForPercent = deferCoding
    ? results.filter((row) => !row.isCoding)
    : results;
  const earnedForPercent = scoredForPercent.reduce((sum, row) => sum + row.earned, 0);
  const denom = scoredForPercent.length > 0 ? scoredForPercent.length : totalQuestions;
  const scorePercent =
    denom > 0 ? roundScorePercent((earnedForPercent / denom) * 100) : 0;
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
