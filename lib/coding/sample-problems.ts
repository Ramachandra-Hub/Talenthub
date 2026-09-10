export type ProgrammingTestCase = {
  input: string;
  expectedOutput: string;
  /** Shown to students after running tests — what this case checks. */
  explanation?: string;
};

export type ProgrammingProblem = {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  statement: string;
  inputFormat: string;
  outputFormat: string;
  sampleInput: string;
  sampleOutput: string;
  hint?: string;
  /** Prefill in the student editor so they can Run immediately. */
  starterCode?: string;
  /** Language students should use (exam UI can lock to this). */
  defaultLanguage?: 'c' | 'python' | 'java';
  /** Plain-language guide shown in ElevateX technical coding. */
  studentGuide?: string;
  /** What skill this problem evaluates in the exam. */
  examPurpose?: string;
  /** Used on Submit to grade (includes sample). */
  testCases: ProgrammingTestCase[];
};

function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

/** True when outputs are equal after whitespace normalization (OJ-style). */
export function outputsMatch(actual: string, expected: string): boolean {
  const a = normalizeOutput(actual);
  const b = normalizeOutput(expected);
  if (a === b) return true;

  // Token compare so "22\n" vs "22", or "1  2" vs "1 2", still pass.
  const tokensA = a.split(/\s+/).filter(Boolean);
  const tokensB = b.split(/\s+/).filter(Boolean);
  if (tokensA.length === 0 || tokensA.length !== tokensB.length) return false;

  return tokensA.every((tok, i) => {
    const exp = tokensB[i]!;
    if (tok === exp) return true;
    const n1 = Number(tok);
    const n2 = Number(exp);
    return Number.isFinite(n1) && Number.isFinite(n2) && n1 === n2;
  });
}

export const PROGRAMMING_SAMPLE_PROBLEMS: ProgrammingProblem[] = [
  {
    id: 'double-number',
    title: 'Double the number',
    difficulty: 'Easy',
    statement: 'Read an integer N from standard input and print twice its value.',
    inputFormat: 'A single line containing integer N (−10⁹ ≤ N ≤ 10⁹).',
    outputFormat: 'Print one integer: 2 × N.',
    sampleInput: '21',
    sampleOutput: '42',
    hint: 'Use stdin/stdout. In Python: n = int(input()); print(n * 2)',
    testCases: [
      { input: '21', expectedOutput: '42' },
      { input: '0', expectedOutput: '0' },
      { input: '-5', expectedOutput: '-10' },
    ],
  },
  {
    id: 'sum-two',
    title: 'Sum of two numbers',
    difficulty: 'Easy',
    statement: 'Read two integers A and B separated by whitespace. Print A + B.',
    inputFormat: 'One line with two integers A and B.',
    outputFormat: 'Print one integer — the sum.',
    sampleInput: '4 7',
    sampleOutput: '11',
    testCases: [
      { input: '4 7', expectedOutput: '11' },
      { input: '100 250', expectedOutput: '350' },
      { input: '-3 3', expectedOutput: '0' },
    ],
  },
  {
    id: 'even-odd',
    title: 'Even or Odd',
    difficulty: 'Easy',
    statement: 'Read integer N. Print EVEN if N is even, otherwise print ODD.',
    inputFormat: 'One integer N.',
    outputFormat: 'Print exactly EVEN or ODD (case-sensitive).',
    sampleInput: '8',
    sampleOutput: 'EVEN',
    testCases: [
      { input: '8', expectedOutput: 'EVEN' },
      { input: '7', expectedOutput: 'ODD' },
      { input: '0', expectedOutput: 'EVEN' },
    ],
  },
];
