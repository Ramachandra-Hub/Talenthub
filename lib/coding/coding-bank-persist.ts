import type { ProgrammingProblem } from '@/lib/coding/sample-problems';

export const CODING_BANK_MARKER = 'coding-bank-v1';
export const CODING_UPLOAD_TAG = 'coding-upload';

export type CodingProblemSource = 'upload' | 'catalog';

export type StoredCodingProblem = {
  marker: typeof CODING_BANK_MARKER;
  problem: ProgrammingProblem;
  defaultLanguage: 'c' | 'python' | 'java';
  source?: CodingProblemSource;
};

export function parseStoredCodingProblem(
  explanation: string | null | undefined,
): StoredCodingProblem | null {
  if (!explanation?.trim()) return null;
  try {
    const parsed = JSON.parse(explanation) as StoredCodingProblem;
    if (parsed?.marker === CODING_BANK_MARKER && parsed.problem?.statement) {
      return {
        ...parsed,
        problem: { ...parsed.problem, starterCode: undefined },
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function buildCodingQuestionPayload(
  problem: ProgrammingProblem,
  defaultLanguage: 'c' | 'python' | 'java',
  source?: CodingProblemSource,
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
    problem: { ...problem, starterCode: undefined },
    defaultLanguage,
    source,
  };
  const tags = [
    CODING_BANK_MARKER,
    `lang:${defaultLanguage}`,
    problem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
  ];
  if (source === 'upload') tags.push(CODING_UPLOAD_TAG);
  return {
    questionText: problem.statement,
    questionType: 'coding',
    type: 'CODING',
    difficulty: problem.difficulty.toLowerCase(),
    correctAnswer: problem.sampleOutput,
    explanation: JSON.stringify(stored),
    tags,
  };
}
