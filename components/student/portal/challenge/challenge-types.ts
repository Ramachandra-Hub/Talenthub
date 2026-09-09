export type ChallengeMode = 'learning' | 'assessment';

export type ChallengeOptionKey = 'A' | 'B' | 'C' | 'D';

export type ChallengeQuestionStatus =
  | 'unanswered'
  | 'selected'
  | 'answered'
  | 'marked'
  | 'correct'
  | 'incorrect';

/** Adapts existing DSA day MCQ payload (answers never included until submit feedback). */
export type ChallengeQuestion = {
  id: string;
  questionNumber: number;
  text: string;
  options: Array<{ key: ChallengeOptionKey; label: string }>;
  difficulty?: string | null;
  topic?: string | null;
  xpReward: number;
  coinReward: number;
  /** Locked-in selection from server */
  selected: ChallengeOptionKey | null;
  answered: boolean;
  markedForReview: boolean;
  /** Learning-mode feedback after lock (never from GET) */
  feedback?: {
    isCorrect: boolean;
    correctAnswer: ChallengeOptionKey;
    explanation: string | null;
  } | null;
};

export type ChallengeSessionMeta = {
  title: string;
  subtitle: string;
  topicName: string;
  dayId: string;
  dayNumber: number;
  backHref: string;
  codeLabHref: string;
  arenaHref: string;
  mode: ChallengeMode;
  totalXp: number;
  totalCoins: number;
};

export type McqSubmitResponse = {
  attemptId?: string;
  saved?: boolean;
  error?: string;
  isCorrect?: boolean;
  correctAnswer?: string;
  explanation?: string | null;
};

export function adaptDayMcqsToChallenge(
  mcqs: Array<{
    id: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    difficulty?: string;
    conceptSlug?: string;
    selected: string | null;
    answered: boolean;
  }>,
): ChallengeQuestion[] {
  return mcqs.map((m, i) => {
    const selected =
      m.selected === 'A' || m.selected === 'B' || m.selected === 'C' || m.selected === 'D'
        ? m.selected
        : null;
    return {
      id: m.id,
      questionNumber: i + 1,
      text: m.questionText,
      options: [
        { key: 'A', label: m.optionA },
        { key: 'B', label: m.optionB },
        { key: 'C', label: m.optionC },
        { key: 'D', label: m.optionD },
      ],
      difficulty: m.difficulty ?? null,
      topic: m.conceptSlug ?? null,
      xpReward: 20,
      coinReward: 5,
      selected,
      answered: Boolean(m.answered || selected),
      markedForReview: false,
      feedback: null,
    };
  });
}

export function navigatorStatus(
  q: ChallengeQuestion,
  isCurrent: boolean,
): 'current' | 'answered' | 'unanswered' | 'marked' | 'correct' | 'incorrect' {
  if (isCurrent) return 'current';
  if (q.markedForReview) return 'marked';
  if (q.feedback?.isCorrect === true) return 'correct';
  if (q.feedback?.isCorrect === false) return 'incorrect';
  if (q.answered || q.selected) return 'answered';
  return 'unanswered';
}
