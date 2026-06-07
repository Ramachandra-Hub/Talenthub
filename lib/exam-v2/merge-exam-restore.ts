import type { TestAnswer } from '@/app/tests/take/[testId]/test-context';
import type { ExamAutosavePayload } from '@/lib/exam-v2/autosave';

function answersFromServerRecord(
  raw: Record<string, unknown> | null | undefined,
): Record<string, TestAnswer> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, TestAnswer> = {};
  for (const [questionId, value] of Object.entries(raw)) {
    if (questionId.startsWith('__')) continue;
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
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

export type ServerOpenAttempt = {
  id: string;
  answers: Record<string, unknown>;
  scorePercent?: number | null;
  savedAtIso: string;
  currentQuestionIndex?: number;
  timeRemaining?: number;
};

/** Prefer newer answers per source; server wins ties when server is newer overall. */
export function mergeExamRestorePayload(
  testId: string,
  draft: ExamAutosavePayload | null,
  server: ServerOpenAttempt | null,
): {
  answers: Record<string, TestAnswer>;
  currentQuestionIndex: number;
  timeRemaining?: number;
  attemptId?: string;
} | null {
  if (!draft && !server) return null;

  const draftAnswers = draft?.answers ?? {};
  const serverAnswers = answersFromServerRecord(server?.answers);
  const draftMs = draft?.savedAt ? new Date(draft.savedAt).getTime() : 0;
  const serverMs = server?.savedAtIso ? new Date(server.savedAtIso).getTime() : 0;
  const serverNewer = serverMs >= draftMs;

  const mergedAnswers: Record<string, TestAnswer> = serverNewer
    ? { ...draftAnswers, ...serverAnswers }
    : { ...serverAnswers, ...draftAnswers };

  const currentQuestionIndex = serverNewer
    ? (server?.currentQuestionIndex ?? draft?.currentQuestionIndex ?? 0)
    : (draft?.currentQuestionIndex ?? server?.currentQuestionIndex ?? 0);

  const timeRemaining = serverNewer
    ? (server?.timeRemaining ?? draft?.timeRemaining)
    : (draft?.timeRemaining ?? server?.timeRemaining);

  return {
    answers: mergedAnswers,
    currentQuestionIndex,
    timeRemaining,
    attemptId: server?.id,
  };
}
