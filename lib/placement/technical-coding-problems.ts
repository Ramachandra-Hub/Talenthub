import type { ProgrammingProblem, ProgrammingTestCase } from '@/lib/coding/sample-problems';
import { forkRng } from '@/lib/competitive-exam/seed-rng';
import { TECHNICAL_CODING_COUNT } from '@/lib/placement/config';
import { pickUniqueByKey } from '@/lib/placement/question-pick';

type ProblemBuilder = (variant: number) => ProgrammingProblem;

type DetailedTest = {
  input: string;
  expectedOutput: string;
  explanation: string;
};

function makeProblem(
  id: string,
  title: string,
  statement: string,
  inputFormat: string,
  outputFormat: string,
  hint: string,
  studentGuide: string,
  examPurpose: string,
  sampleInput: string,
  sampleOutput: string,
  hiddenTests: DetailedTest[],
): ProgrammingProblem {
  const sample: ProgrammingTestCase = {
    input: sampleInput,
    expectedOutput: sampleOutput,
    explanation:
      'Sample case — confirms your program reads stdin correctly and prints the expected format before hidden cases run.',
  };
  return {
    id,
    title,
    difficulty: 'Easy',
    statement,
    inputFormat,
    outputFormat,
    hint,
    studentGuide,
    examPurpose,
    sampleInput,
    sampleOutput,
    testCases: [sample, ...hiddenTests],
  };
}

function codingProblemFamily(p: ProgrammingProblem): string {
  const m = p.id.match(/^(tech-[a-z0-9-]+)-\d+$/);
  return m?.[1] ?? p.id;
}

function buildSumThree(variant: number): ProgrammingProblem {
  const a = 2 + variant;
  const b = 3 + variant * 2;
  const c = 4 - variant;
  const sum = a + b + c;
  return makeProblem(
    `tech-sum-three-${variant}`,
    `Sum of Three Numbers #${variant + 1}`,
    'Read three integers A, B, and C from standard input and print their sum on one line.',
    'One line with three space-separated integers.',
    'Print one integer: A + B + C.',
    'Read three values, add them, and print the result.',
    'You will practice reading multiple integers from one line and performing basic arithmetic — a core skill in every coding round.',
    'Tests whether you can parse stdin and compute a simple aggregate correctly under time pressure.',
    `${a} ${b} ${c}`,
    String(sum),
    [
      {
        input: `${10 + variant} ${variant} ${-3 - variant}`,
        expectedOutput: String(7),
        explanation: 'Mixed positive and negative values — checks sign handling.',
      },
      {
        input: `${-5 - variant} ${-6} ${-7}`,
        expectedOutput: String(-18 - variant),
        explanation: 'All negative inputs — sum should stay negative.',
      },
      {
        input: '0 0 0',
        expectedOutput: '0',
        explanation: 'Zero edge case — output must be exactly 0.',
      },
      {
        input: '100 200 300',
        expectedOutput: '600',
        explanation: 'Larger magnitudes — verifies no overflow in your language for this range.',
      },
      {
        input: '1 2 3',
        expectedOutput: '6',
        explanation: 'Small positive triplet — baseline correctness check.',
      },
    ],
  );
}

function buildMaxOfThree(variant: number): ProgrammingProblem {
  const x = 9 + variant;
  const y = 4 - variant;
  const z = 7 + variant;
  return makeProblem(
    `tech-max-three-${variant}`,
    `Maximum of Three #${variant + 1}`,
    'Read three integers and print the largest among them.',
    'One line with three integers.',
    'Print the maximum value as a single integer.',
    'Compare values while reading or store them then use max logic.',
    'You learn comparison logic used in sorting, scheduling, and resource allocation problems.',
    'Evaluates conditional reasoning and correct comparison of multiple inputs.',
    `${x} ${y} ${z}`,
    String(Math.max(x, y, z)),
    [
      {
        input: `${-2 - variant} -8 -1`,
        expectedOutput: '-1',
        explanation: 'Negative set — maximum is still the least negative number.',
      },
      {
        input: '5 5 3',
        expectedOutput: '5',
        explanation: 'Duplicate maximum — either 5 is acceptable as the max.',
      },
      {
        input: '0 0 0',
        expectedOutput: '0',
        explanation: 'All equal — output is that common value.',
      },
      {
        input: '42 1 42',
        expectedOutput: '42',
        explanation: 'Maximum appears twice — tests tie handling.',
      },
      {
        input: '3 9 6',
        expectedOutput: '9',
        explanation: 'Middle value is largest — not always the first or last token.',
      },
    ],
  );
}

function buildParity(variant: number): ProgrammingProblem {
  const n = 8 + variant;
  const parity = n % 2 === 0 ? 'EVEN' : 'ODD';
  return makeProblem(
    `tech-even-odd-${variant}`,
    `Even or Odd #${variant + 1}`,
    'Read integer N. Print EVEN if N is even, otherwise print ODD (exact spelling, uppercase).',
    'One integer N.',
    'Print exactly EVEN or ODD.',
    'Use N % 2 — remainder 0 means even.',
    'Parity checks appear in bit-manipulation, hashing, and array indexing tasks.',
    'Tests modulo arithmetic and exact string output formatting.',
    String(n),
    parity,
    [
      { input: '7', expectedOutput: 'ODD', explanation: 'Odd positive integer.' },
      { input: '0', expectedOutput: 'EVEN', explanation: 'Zero is even in computer science.' },
      { input: '-4', expectedOutput: 'EVEN', explanation: 'Negative even number.' },
      { input: '-3', expectedOutput: 'ODD', explanation: 'Negative odd number.' },
      { input: '1000002', expectedOutput: 'EVEN', explanation: 'Large even value.' },
    ],
  );
}

function buildVowelCount(variant: number): ProgrammingProblem {
  const words = ['education', 'placement', 'algorithm', 'hacker', 'compiler', 'science'];
  const word = words[variant % words.length]!;
  const count = [...word].filter((c) => 'aeiou'.includes(c)).length;
  return makeProblem(
    `tech-vowel-count-${variant}`,
    `Count Vowels #${variant + 1}`,
    'Read a lowercase English word and print the count of vowels (a, e, i, o, u).',
    'One lowercase word without spaces.',
    'Print one integer: vowel count.',
    'Loop characters and increment when char is in "aeiou".',
    'String scanning is required in parsing, validation, and NLP-style tasks.',
    'Evaluates character iteration and simple classification logic.',
    word,
    String(count),
    [
      { input: 'sky', expectedOutput: '0', explanation: 'No vowels in the word.' },
      { input: 'queue', expectedOutput: '4', explanation: 'Multiple vowels including consecutive ones.' },
      { input: 'aeiou', expectedOutput: '5', explanation: 'All characters are vowels.' },
      { input: 'bcdfg', expectedOutput: '0', explanation: 'Consonants only.' },
      { input: 'hello', expectedOutput: '2', explanation: 'Typical mixed word.' },
    ],
  );
}

function buildReverseDigits(variant: number): ProgrammingProblem {
  const n = 123 + variant * 7;
  const rev = String(n).split('').reverse().join('');
  return makeProblem(
    `tech-reverse-digits-${variant}`,
    `Reverse Digits #${variant + 1}`,
    'Read a positive integer N and print its digits reversed (no leading zeros unless N was 0).',
    'One integer N (N > 0).',
    'Print reversed digits as an integer.',
    'Convert to string, reverse, or use arithmetic loop.',
    'Digit manipulation appears in palindrome checks and number theory questions.',
    'Tests string/number conversion and careful output formatting.',
    String(n),
    rev,
    [
      { input: '1203', expectedOutput: '3021', explanation: 'Trailing zero in input becomes leading digit in output.' },
      { input: '9', expectedOutput: '9', explanation: 'Single digit stays unchanged.' },
      { input: '100', expectedOutput: '1', explanation: 'Leading zeros after reverse are dropped.' },
      { input: '1221', expectedOutput: '1221', explanation: 'Palindrome — reverse equals original.' },
      { input: '40506', expectedOutput: '60504', explanation: 'Internal zero preserved in middle.' },
    ],
  );
}

function buildStringLength(variant: number): ProgrammingProblem {
  const word = `code${variant}`;
  return makeProblem(
    `tech-string-len-${variant}`,
    `String Length #${variant + 1}`,
    'Read one word and print its length (number of characters).',
    'One word (no spaces).',
    'Print one integer: character count.',
    'Use built-in length or manual counter.',
    'Length checks are used in buffer sizing, validation, and substring logic.',
    'Evaluates basic string API usage or manual counting.',
    word,
    String(word.length),
    [
      { input: 'a', expectedOutput: '1', explanation: 'Minimum non-empty word.' },
      { input: 'placement', expectedOutput: '9', explanation: 'Standard dictionary word.' },
      { input: 'xyz', expectedOutput: '3', explanation: 'Short word baseline.' },
      { input: 'openai', expectedOutput: '6', explanation: 'Mixed letters count.' },
      { input: 'race', expectedOutput: '4', explanation: 'Four-letter token.' },
    ],
  );
}

function buildArraySum(variant: number): ProgrammingProblem {
  const n = 5;
  const arr = [variant + 1, 2, 3, 4, 5];
  const sum = arr.reduce((a, b) => a + b, 0);
  return makeProblem(
    `tech-array-sum-${variant}`,
    `Array Sum #${variant + 1}`,
    'Read N, then N integers on the next line. Print the sum of all elements.',
    'Line 1: N. Line 2: N space-separated integers.',
    'Print one integer — total sum.',
    'Loop N times and accumulate into sum.',
    'Array aggregation is the foundation of statistics, dashboards, and batch processing.',
    'Tests multi-line input parsing and accumulation loops.',
    `${n}\n${arr.join(' ')}`,
    String(sum),
    [
      { input: '3\n10 20 30', expectedOutput: '60', explanation: 'Three positive values.' },
      { input: '4\n-1 -2 3 4', expectedOutput: '4', explanation: 'Mixed signs in the array.' },
      { input: '1\n99', expectedOutput: '99', explanation: 'Single-element array.' },
      { input: '5\n1 1 1 1 1', expectedOutput: '5', explanation: 'Uniform small values.' },
      { input: '2\n0 0', expectedOutput: '0', explanation: 'Zeros only.' },
    ],
  );
}

function buildCountPositives(variant: number): ProgrammingProblem {
  const arr = [variant - 1, 2, -3, 4, 5];
  const positive = arr.filter((x) => x > 0).length;
  return makeProblem(
    `tech-count-positive-${variant}`,
    `Count Positive Numbers #${variant + 1}`,
    'Read N and N integers. Count how many values are strictly greater than zero.',
    'Line 1: N. Line 2: N integers.',
    'Print the count of positive numbers.',
    'Increment counter when value > 0.',
    'Filtering counts are used in analytics, quality checks, and threshold alerts.',
    'Tests conditional counting over an array.',
    `5\n${arr.join(' ')}`,
    String(positive),
    [
      { input: '4\n0 0 0 1', expectedOutput: '1', explanation: 'Only one positive among zeros.' },
      { input: '3\n-5 -6 -7', expectedOutput: '0', explanation: 'No positive values.' },
      { input: '3\n5 6 7', expectedOutput: '3', explanation: 'All positive.' },
      { input: '2\n-1 2', expectedOutput: '1', explanation: 'Mixed pair.' },
      { input: '1\n100', expectedOutput: '1', explanation: 'Single positive element.' },
    ],
  );
}

function buildMultiplyTwo(variant: number): ProgrammingProblem {
  const a = 2 + variant;
  const b = 4 + variant;
  return makeProblem(
    `tech-mul-two-${variant}`,
    `Multiply Two Numbers #${variant + 1}`,
    'Read integers A and B. Print A × B.',
    'One line with two integers.',
    'Print one integer — the product.',
    'Multiply after reading both values.',
    'Multiplication appears in scaling, combinatorics, and unit conversion formulas.',
    'Tests reading two tokens and arithmetic.',
    `${a} ${b}`,
    String(a * b),
    [
      { input: '5 0', expectedOutput: '0', explanation: 'Multiplying by zero.' },
      { input: '-2 6', expectedOutput: '-12', explanation: 'Negative times positive.' },
      { input: '-3 -4', expectedOutput: '12', explanation: 'Negative times negative.' },
      { input: '11 11', expectedOutput: '121', explanation: 'Perfect square product.' },
      { input: '1 999', expectedOutput: '999', explanation: 'Identity multiplication.' },
    ],
  );
}

function buildMinInArray(variant: number): ProgrammingProblem {
  const arr = [8 + variant, 3, 10, -2 + variant, 7];
  return makeProblem(
    `tech-min-array-${variant}`,
    `Minimum in Array #${variant + 1}`,
    'Read N and N integers. Print the smallest value in the array.',
    'Line 1: N. Line 2: N integers.',
    'Print one integer — minimum element.',
    'Track running minimum while scanning.',
    'Finding min/max is used in optimization, ranges, and sliding-window problems.',
    'Evaluates array traversal with comparison.',
    `5\n${arr.join(' ')}`,
    String(Math.min(...arr)),
    [
      { input: '3\n9 9 9', expectedOutput: '9', explanation: 'All elements equal.' },
      { input: '4\n-5 3 0 2', expectedOutput: '-5', explanation: 'Negative minimum.' },
      { input: '1\n42', expectedOutput: '42', explanation: 'Single element.' },
      { input: '5\n1 2 3 4 5', expectedOutput: '1', explanation: 'Strictly increasing sequence.' },
      { input: '4\n10 2 8 2', expectedOutput: '2', explanation: 'Duplicate minimum value.' },
    ],
  );
}

function buildFirstLastSum(variant: number): ProgrammingProblem {
  const arr = [variant + 3, 5, 7, 9, variant + 1];
  const out = arr[0]! + arr[arr.length - 1]!;
  return makeProblem(
    `tech-first-last-sum-${variant}`,
    `First + Last Sum #${variant + 1}`,
    'Read N and N integers. Print the sum of the first and last element.',
    'Line 1: N. Line 2: N integers (N ≥ 1).',
    'Print one integer.',
    'Use index 0 and index N−1 after storing the array.',
    'Index access at boundaries is common in deque operations and window problems.',
    'Tests array indexing, not just iteration.',
    `5\n${arr.join(' ')}`,
    String(out),
    [
      { input: '1\n42', expectedOutput: '84', explanation: 'With one element, first+last = 2× that element.' },
      { input: '3\n4 5 6', expectedOutput: '10', explanation: 'First 4 + last 6.' },
      { input: '2\n10 20', expectedOutput: '30', explanation: 'Two elements only.' },
      { input: '4\n1 2 3 4', expectedOutput: '5', explanation: 'Ends of a short sequence.' },
      { input: '5\n-1 0 0 0 1', expectedOutput: '0', explanation: 'Symmetric ends summing to zero.' },
    ],
  );
}

function buildDivisibleByK(variant: number): ProgrammingProblem {
  const k = (variant % 4) + 2;
  const arr = [k, k + 1, k * 2, 7, 8];
  const cnt = arr.filter((x) => x % k === 0).length;
  return makeProblem(
    `tech-divisible-k-${variant}`,
    `Count Divisible by K #${variant + 1}`,
    'Read N, K, then N integers. Print how many numbers are divisible by K.',
    'Line 1: N and K. Line 2: N integers.',
    'Print one integer count.',
    'For each value, check value % K === 0.',
    'Divisibility checks underpin factors, multiples, and modular arithmetic.',
    'Evaluates modulo operator in a loop.',
    `5 ${k}\n${arr.join(' ')}`,
    String(cnt),
    [
      { input: '4 3\n3 6 7 8', expectedOutput: '2', explanation: '3 and 6 divisible by 3.' },
      { input: '5 10\n1 2 3 4 5', expectedOutput: '0', explanation: 'No multiples of 10 in small numbers.' },
      { input: '3 2\n2 4 6', expectedOutput: '3', explanation: 'All even numbers divisible by 2.' },
      { input: '1 5\n5', expectedOutput: '1', explanation: 'Single matching element.' },
      { input: '4 1\n9 8 7 6', expectedOutput: '4', explanation: 'Every integer divisible by 1.' },
    ],
  );
}

const BUILDERS: ProblemBuilder[] = [
  buildSumThree,
  buildMaxOfThree,
  buildParity,
  buildVowelCount,
  buildReverseDigits,
  buildStringLength,
  buildArraySum,
  buildCountPositives,
  buildMultiplyTwo,
  buildMinInArray,
  buildFirstLastSum,
  buildDivisibleByK,
];

const VARIANTS_PER_BUILDER = 80; // 12 × 80 = 960 unique coding templates

function buildTechnicalCodingBank(): ProgrammingProblem[] {
  const bank: ProgrammingProblem[] = [];
  for (const build of BUILDERS) {
    for (let v = 0; v < VARIANTS_PER_BUILDER; v++) {
      bank.push(build(v));
    }
  }
  return bank;
}

export const TECHNICAL_CODING_BANK: ProgrammingProblem[] = buildTechnicalCodingBank();
export const TECHNICAL_CODING_BANK_SIZE = TECHNICAL_CODING_BANK.length;

/** Three unique problem families per student (seed + branch). */
export function buildTechnicalCodingProblems(
  seed: string,
  departmentId: string,
): ProgrammingProblem[] {
  const rng = forkRng(`${seed}|${departmentId}`, 'placement-tech-coding');
  const picked = pickUniqueByKey(
    TECHNICAL_CODING_BANK,
    TECHNICAL_CODING_COUNT,
    rng,
    codingProblemFamily,
  );
  return picked.map((p, i) => ({
    ...p,
    id: `placement-tech-code-${i + 1}`,
  }));
}
