import type { ProgrammingProblem, ProgrammingTestCase } from '@/lib/coding/sample-problems';
import type { CodingLanguageId } from '@/lib/coding/languages';

export type GeneratedCodingDraft = {
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  sampleInput: string;
  sampleOutput: string;
  hint: string;
  studentGuide?: string;
  examPurpose: string;
  testCases: ProgrammingTestCase[];
  difficulty: 'Easy' | 'Medium';
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleFromStatement(statement: string): string {
  const words = statement.trim().split(/\s+/).slice(0, 8);
  const raw = words.join(' ');
  if (!raw) return 'Coding problem';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function langHint(lang?: CodingLanguageId): string {
  if (lang === 'c') return 'Use scanf/printf. Read input line by line as needed.';
  return 'Use input() and print(). Split lines with .split() when reading arrays.';
}

function joinNums(nums: number[]): string {
  return nums.join(' ');
}

function addArrays(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

function buildArrayPairCases(
  op: (a: number[], b: number[]) => number[] | number,
  formatOutput: (v: number[] | number) => string,
): { input: string; expectedOutput: string }[] {
  const pairs: [number[], number[]][] = [
    [[1, 2, 3], [4, 5, 6]],
    [[10, -2, 0], [3, 2, 5]],
    [[7], [8]],
    [[0, 0, 0], [0, 0, 0]],
  ];
  return pairs.map(([a, b]) => {
    const n = a.length;
    const input = `${n}\n${joinNums(a)}\n${joinNums(b)}`;
    const out = formatOutput(op(a, b));
    return { input, expectedOutput: out };
  });
}

type Template = {
  test: (n: string) => boolean;
  build: (statement: string, lang?: CodingLanguageId) => GeneratedCodingDraft;
};

const TEMPLATES: Template[] = [
  {
    test: (n) =>
      /\b(add|sum)\b.*\b(two|2)\b.*\barray/.test(n) ||
      /\barray\b.*\b(add|sum)\b/.test(n) ||
      /\belement\s*wise\b/.test(n),
    build: (statement, lang) => {
      const cases = buildArrayPairCases(addArrays, (v) => joinNums(v as number[]));
      return {
        title: titleFromStatement(statement),
        statement:
          statement.trim() ||
          'Read the size N, then two arrays of N integers each. Print the element-wise sum.',
        inputFormat: 'Line 1: integer N. Line 2: N integers (array A). Line 3: N integers (array B).',
        outputFormat: 'Print N integers — A[i] + B[i] for each index, space-separated.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        studentGuide: 'Read N, then two lines of N numbers. Loop and add corresponding elements.',
        examPurpose: 'Arrays and loops',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) =>
      /\bmerge\b.*\barray/.test(n) ||
      /\bcombine\b.*\barray/.test(n) ||
      /\bconcatenate\b.*\barray/.test(n),
    build: (statement, lang) => {
      const cases = [
        { a: [1, 2], b: [3, 4], out: '1 2 3 4' },
        { a: [10], b: [20, 30], out: '10 20 30' },
        { a: [0, 0], b: [5], out: '0 0 5' },
      ].map(({ a, b, out }) => ({
        input: `${a.length} ${b.length}\n${joinNums(a)}\n${joinNums(b)}`,
        expectedOutput: out,
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Merge two arrays and print all elements space-separated.',
        inputFormat: 'Line 1: sizes N and M. Line 2: N integers. Line 3: M integers.',
        outputFormat: 'Print all elements of A followed by B, space-separated.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arrays',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bsum\b.*\barray\b/.test(n) || /\barray\b.*\bsum\b/.test(n) || /\btotal\b.*\belements\b/.test(n),
    build: (statement, lang) => {
      const arrays = [[1, 2, 3, 4], [10, -5, 0], [7], [0, 0, 0]];
      const cases = arrays.map((arr) => ({
        input: `${arr.length}\n${joinNums(arr)}`,
        expectedOutput: String(arr.reduce((s, v) => s + v, 0)),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read N and an array of N integers. Print the sum of all elements.',
        inputFormat: 'Line 1: integer N. Line 2: N space-separated integers.',
        outputFormat: 'Print one integer — the sum of the array.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arrays and accumulation',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bsort\b.*\barray\b/.test(n) || /\barray\b.*\bsort\b/.test(n),
    build: (statement, lang) => {
      const arrays = [
        [3, 1, 2],
        [10, -1, 0],
        [5],
        [2, 2, 1],
      ];
      const cases = arrays.map((arr) => ({
        input: `${arr.length}\n${joinNums(arr)}`,
        expectedOutput: joinNums([...arr].sort((a, b) => a - b)),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read N and an array of N integers. Print the sorted array in ascending order.',
        inputFormat: 'Line 1: integer N. Line 2: N integers.',
        outputFormat: 'Print N integers in non-decreasing order, space-separated.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Sorting',
        testCases: cases,
        difficulty: 'Medium',
      };
    },
  },
  {
    test: (n) =>
      /\b(add|sum)\b.*\b(two|2)\b.*\b(number|integer|num)/.test(n) ||
      /\b(two|2)\b.*\bnumber/.test(n) && /\b(add|sum)\b/.test(n),
    build: (statement, lang) => {
      const pairs: [number, number][] = [
        [4, 7],
        [100, 250],
        [-3, 3],
        [0, 0],
      ];
      const cases = pairs.map(([a, b]) => ({
        input: `${a} ${b}`,
        expectedOutput: String(a + b),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read two integers A and B. Print A + B.',
        inputFormat: 'One line with two integers A and B.',
        outputFormat: 'Print one integer — the sum.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Basic I/O',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\b(multiply|product)\b.*\b(two|2)\b/.test(n) || /\bproduct\b/.test(n),
    build: (statement, lang) => {
      const pairs: [number, number][] = [
        [3, 4],
        [10, 0],
        [-2, 5],
        [7, 7],
      ];
      const cases = pairs.map(([a, b]) => ({
        input: `${a} ${b}`,
        expectedOutput: String(a * b),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read two integers A and B. Print A × B.',
        inputFormat: 'One line with two integers.',
        outputFormat: 'Print one integer — the product.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arithmetic',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\breverse\b.*\bstring\b/.test(n) || /\bstring\b.*\breverse\b/.test(n),
    build: (statement, lang) => {
      const words = ['hello', 'abcd', 'a', 'racecar'];
      const cases = words.map((w) => ({ input: w, expectedOutput: [...w].reverse().join('') }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read a string S and print its reverse.',
        inputFormat: 'One line containing string S (no spaces).',
        outputFormat: 'Print the reversed string.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Strings',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\beven\b.*\bodd\b/.test(n) || /\bodd\b.*\beven\b/.test(n),
    build: (statement, lang) => {
      const nums = [8, 7, 0, -4];
      const cases = nums.map((n) => ({
        input: String(n),
        expectedOutput: n % 2 === 0 ? 'EVEN' : 'ODD',
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read integer N. Print EVEN if N is even, else ODD.',
        inputFormat: 'One integer N.',
        outputFormat: 'Print EVEN or ODD (uppercase).',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Conditionals',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bfactorial\b/.test(n),
    build: (statement, lang) => {
      const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
      const nums = [0, 1, 5, 6];
      const cases = nums.map((n) => ({ input: String(n), expectedOutput: String(fact(n)) }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read non-negative integer N. Print N! (factorial).',
        inputFormat: 'One integer N (0 ≤ N ≤ 12).',
        outputFormat: 'Print factorial of N.',
        sampleInput: cases[2]!.input,
        sampleOutput: cases[2]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Loops / recursion',
        testCases: cases,
        difficulty: 'Medium',
      };
    },
  },
  {
    test: (n) => /\b(max|maximum|largest)\b/.test(n) && !/\bmin\b/.test(n),
    build: (statement, lang) => {
      const arrays = [
        [1, 9, 3],
        [-5, -1, -10],
        [42],
        [0, 0],
      ];
      const cases = arrays.map((arr) => ({
        input: `${arr.length}\n${joinNums(arr)}`,
        expectedOutput: String(Math.max(...arr)),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read N and N integers. Print the maximum value.',
        inputFormat: 'Line 1: N. Line 2: N integers.',
        outputFormat: 'Print one integer — the maximum.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arrays',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\b(min|minimum|smallest)\b/.test(n),
    build: (statement, lang) => {
      const arrays = [
        [1, 9, 3],
        [-5, -1, -10],
        [42],
        [0, 0],
      ];
      const cases = arrays.map((arr) => ({
        input: `${arr.length}\n${joinNums(arr)}`,
        expectedOutput: String(Math.min(...arr)),
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read N and N integers. Print the minimum value.',
        inputFormat: 'Line 1: N. Line 2: N integers.',
        outputFormat: 'Print one integer — the minimum.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arrays',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bfibonacci\b/.test(n) || /\bfib\b/.test(n),
    build: (statement, lang) => {
      const fib = (k: number): number => {
        if (k <= 1) return k;
        let a = 0;
        let b = 1;
        for (let i = 2; i <= k; i += 1) {
          const c = a + b;
          a = b;
          b = c;
        }
        return b;
      };
      const nums = [0, 1, 5, 10];
      const cases = nums.map((n) => ({ input: String(n), expectedOutput: String(fib(n)) }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read integer N. Print the Nth Fibonacci number (F(0)=0, F(1)=1).',
        inputFormat: 'One integer N (0 ≤ N ≤ 30).',
        outputFormat: 'Print F(N).',
        sampleInput: cases[2]!.input,
        sampleOutput: cases[2]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Loops',
        testCases: cases,
        difficulty: 'Medium',
      };
    },
  },
  {
    test: (n) => /\bpalindrome\b/.test(n),
    build: (statement, lang) => {
      const words = ['madam', 'hello', 'a', 'abba'];
      const cases = words.map((w) => ({
        input: w,
        expectedOutput: w === [...w].reverse().join('') ? 'YES' : 'NO',
      }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read string S. Print YES if S is a palindrome, else NO.',
        inputFormat: 'One line — string S.',
        outputFormat: 'Print YES or NO.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Strings',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bvowel/.test(n) || /\bcount\b.*\bletter/.test(n),
    build: (statement, lang) => {
      const countV = (s: string) => (s.match(/[aeiouAEIOU]/g) ?? []).length;
      const words = ['hello', 'xyz', 'aeiou', 'PrepIndia'];
      const cases = words.map((w) => ({ input: w, expectedOutput: String(countV(w)) }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read a string and print the number of vowels (a,e,i,o,u).',
        inputFormat: 'One line — string S.',
        outputFormat: 'Print vowel count.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Strings',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\baverage\b/.test(n) || /\bmean\b/.test(n),
    build: (statement, lang) => {
      const arrays = [
        [10, 20, 30],
        [1, 2],
        [5],
        [0, 0, 0],
      ];
      const cases = arrays.map((arr) => {
        const sum = arr.reduce((s, v) => s + v, 0);
        const avg = sum / arr.length;
        return {
          input: `${arr.length}\n${joinNums(arr)}`,
          expectedOutput: Number.isInteger(avg) ? String(avg) : avg.toFixed(2),
        };
      });
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read N and N integers. Print the average (mean).',
        inputFormat: 'Line 1: N. Line 2: N integers.',
        outputFormat: 'Print average as integer if whole, else 2 decimal places.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Arrays',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
  {
    test: (n) => /\bdouble\b/.test(n) || /\btwice\b/.test(n),
    build: (statement, lang) => {
      const nums = [21, 0, -5, 100];
      const cases = nums.map((n) => ({ input: String(n), expectedOutput: String(n * 2) }));
      return {
        title: titleFromStatement(statement),
        statement: statement.trim() || 'Read integer N and print 2 × N.',
        inputFormat: 'One integer N.',
        outputFormat: 'Print one integer.',
        sampleInput: cases[0]!.input,
        sampleOutput: cases[0]!.expectedOutput,
        hint: langHint(lang),
        examPurpose: 'Basic I/O',
        testCases: cases,
        difficulty: 'Easy',
      };
    },
  },
];

function fallbackTemplate(statement: string, lang?: CodingLanguageId): GeneratedCodingDraft {
  const n = normalize(statement);
  if (n.includes('array')) {
    return TEMPLATES[0]!.build(statement, lang);
  }
  if (n.includes('string')) {
    return TEMPLATES.find((t) => t.test('reverse string'))!.build(statement, lang);
  }
  return TEMPLATES.find((t) => t.test('sum two numbers'))!.build(statement, lang);
}

/** Build a full coding problem (with test cases) from a short natural-language description. */
export function generateCodingFromStatement(
  rawStatement: string,
  options?: { title?: string; defaultLanguage?: CodingLanguageId },
): GeneratedCodingDraft {
  const statement = rawStatement.trim();
  const normalized = normalize(statement);
  const template = TEMPLATES.find((t) => t.test(normalized));
  const draft = template ? template.build(statement, options?.defaultLanguage) : fallbackTemplate(statement, options?.defaultLanguage);

  if (options?.title?.trim()) {
    draft.title = options.title.trim();
  }
  if (!draft.statement) {
    draft.statement = statement;
  }
  return draft;
}

export function generatedDraftToProblem(
  draft: GeneratedCodingDraft,
  id: string,
  lang?: CodingLanguageId,
): ProgrammingProblem {
  return {
    id,
    title: draft.title,
    difficulty: draft.difficulty,
    statement: draft.statement,
    inputFormat: draft.inputFormat,
    outputFormat: draft.outputFormat,
    sampleInput: draft.sampleInput,
    sampleOutput: draft.sampleOutput,
    hint: draft.hint,
    studentGuide:
      draft.studentGuide ??
      (lang === 'c' ? 'Write a complete C program with main().' : 'Write a complete Python solution.'),
    examPurpose: draft.examPurpose,
    testCases: draft.testCases,
  };
}
