import type { ProgrammingProblem } from '@/lib/coding/sample-problems';

export const CODING_BANK_MARKER = 'coding-bank-v1';

export type StoredCodingProblem = {
  marker: typeof CODING_BANK_MARKER;
  problem: ProgrammingProblem;
  defaultLanguage: 'c' | 'python';
};

export function parseStoredCodingProblem(
  explanation: string | null | undefined,
): StoredCodingProblem | null {
  if (!explanation?.trim()) return null;
  try {
    const parsed = JSON.parse(explanation) as StoredCodingProblem;
    if (parsed?.marker === CODING_BANK_MARKER && parsed.problem?.statement) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildCodingQuestionPayload(
  problem: ProgrammingProblem,
  defaultLanguage: 'c' | 'python',
): {
  questionText: string;
  questionType: string;
  type: string;
  difficulty: string;
  correctAnswer: string;
  explanation: string;
  tags: string[];
} {
  const stored: StoredCodingProblem = {
    marker: CODING_BANK_MARKER,
    problem,
    defaultLanguage,
  };
  return {
    questionText: problem.statement,
    questionType: 'coding',
    type: 'CODING',
    difficulty: problem.difficulty.toLowerCase(),
    correctAnswer: problem.sampleOutput,
    explanation: JSON.stringify(stored),
    tags: [
      CODING_BANK_MARKER,
      `lang:${defaultLanguage}`,
      problem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
    ],
  };
}
