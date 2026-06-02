import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import { forkRng, shuffleInPlace } from '@/lib/competitive-exam/seed-rng';

type ProblemBuilder = (variant: number) => ProgrammingProblem;

function makeProblem(
  id: string,
  title: string,
  statement: string,
  inputFormat: string,
  outputFormat: string,
  hint: string,
  sampleInput: string,
  sampleOutput: string,
  extraTests: Array<{ input: string; expectedOutput: string }>,
): ProgrammingProblem {
  return {
    id,
    title,
    difficulty: 'Easy',
    statement,
    inputFormat,
    outputFormat,
    hint,
    sampleInput,
    sampleOutput,
    testCases: [{ input: sampleInput, expectedOutput: sampleOutput }, ...extraTests],
  };
}

function buildSumThree(variant: number): ProgrammingProblem {
  const a = 2 + variant;
  const b = 3 + variant * 2;
  const c = 4 - variant;
  return makeProblem(
    `tech-sum-three-${variant}`,
    `Sum of Three Numbers #${variant + 1}`,
    'Read three integers A, B, C and print their sum.',
    'One line with three space-separated integers.',
    'Print one integer: A + B + C.',
    'Read all values and add them directly.',
    `${a} ${b} ${c}`,
    String(a + b + c),
    [
      { input: `${10 + variant} ${variant} ${-3 - variant}`, expectedOutput: String(7) },
      { input: `${-5 - variant} ${-6} ${-7}`, expectedOutput: String(-18 - variant) },
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
    'Read three integers and print the largest value.',
    'One line with three integers.',
    'Print the maximum integer.',
    'Track current max while reading values.',
    `${x} ${y} ${z}`,
    String(Math.max(x, y, z)),
    [
      { input: `${-2 - variant} -8 -1`, expectedOutput: '-1' },
      { input: `5 5 ${3 - variant}`, expectedOutput: '5' },
    ],
  );
}

function buildParity(variant: number): ProgrammingProblem {
  const n = 8 + variant;
  const parity = n % 2 === 0 ? 'EVEN' : 'ODD';
  return makeProblem(
    `tech-even-odd-${variant}`,
    `Even or Odd #${variant + 1}`,
    'Read an integer N. Print EVEN if N is even, otherwise print ODD.',
    'One integer N.',
    'Print exactly EVEN or ODD.',
    'Use modulo operation: N % 2.',
    String(n),
    parity,
    [
      { input: '7', expectedOutput: 'ODD' },
      { input: '0', expectedOutput: 'EVEN' },
    ],
  );
}

function buildVowelCount(variant: number): ProgrammingProblem {
  const words = ['education', 'placement', 'algorithm', 'hacker', 'compiler', 'science'];
  const word = words[variant % words.length];
  const count = [...word].filter((c) => 'aeiou'.includes(c)).length;
  return makeProblem(
    `tech-vowel-count-${variant}`,
    `Count Vowels #${variant + 1}`,
    'Read a lowercase word and print how many vowels (a, e, i, o, u) it contains.',
    'One lowercase word.',
    'Print one integer: number of vowels.',
    'Loop through each character and check membership in "aeiou".',
    word,
    String(count),
    [
      { input: 'sky', expectedOutput: '0' },
      { input: 'queue', expectedOutput: '4' },
    ],
  );
}

function buildReverseDigits(variant: number): ProgrammingProblem {
  const n = 123 + variant * 7;
  const rev = String(n).split('').reverse().join('');
  return makeProblem(
    `tech-reverse-digits-${variant}`,
    `Reverse Digits #${variant + 1}`,
    'Read a positive integer N and print its digits in reverse order.',
    'One integer N (N > 0).',
    'Print reversed digits as integer/string.',
    'Convert to string and reverse.',
    String(n),
    rev,
    [
      { input: '1203', expectedOutput: '3021' },
      { input: '9', expectedOutput: '9' },
    ],
  );
}

function buildStringLength(variant: number): ProgrammingProblem {
  const word = `code${variant}`;
  return makeProblem(
    `tech-string-len-${variant}`,
    `String Length #${variant + 1}`,
    'Read one word and print its length.',
    'One word (no spaces).',
    'Print one integer: length of word.',
    'Most languages provide built-in length function.',
    word,
    String(word.length),
    [
      { input: 'a', expectedOutput: '1' },
      { input: 'placement', expectedOutput: '9' },
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
    'Read N and then N integers. Print the sum of all elements.',
    'First line N. Second line N integers.',
    'Print one integer: sum.',
    'Initialize sum = 0 and accumulate in loop.',
    `${n}\n${arr.join(' ')}`,
    String(sum),
    [
      { input: '3\n10 20 30', expectedOutput: '60' },
      { input: '4\n-1 -2 3 4', expectedOutput: '4' },
    ],
  );
}

function buildCountPositives(variant: number): ProgrammingProblem {
  const arr = [variant - 1, 2, -3, 4, 5];
  const positive = arr.filter((x) => x > 0).length;
  return makeProblem(
    `tech-count-positive-${variant}`,
    `Count Positive Numbers #${variant + 1}`,
    'Read N and N integers. Count how many numbers are strictly greater than zero.',
    'First line N, second line N integers.',
    'Print one integer: count of positive numbers.',
    'Increase counter when value > 0.',
    `5\n${arr.join(' ')}`,
    String(positive),
    [
      { input: '4\n0 0 0 1', expectedOutput: '1' },
      { input: '3\n-5 -6 -7', expectedOutput: '0' },
    ],
  );
}

function buildMultiplyTwo(variant: number): ProgrammingProblem {
  const a = 2 + variant;
  const b = 4 + variant;
  return makeProblem(
    `tech-mul-two-${variant}`,
    `Multiply Two Numbers #${variant + 1}`,
    'Read two integers A and B. Print A * B.',
    'One line with two integers.',
    'Print one integer: product.',
    'Direct multiplication.',
    `${a} ${b}`,
    String(a * b),
    [
      { input: '5 0', expectedOutput: '0' },
      { input: '-2 6', expectedOutput: '-12' },
    ],
  );
}

function buildMinInArray(variant: number): ProgrammingProblem {
  const arr = [8 + variant, 3, 10, -2 + variant, 7];
  return makeProblem(
    `tech-min-array-${variant}`,
    `Minimum in Array #${variant + 1}`,
    'Read N and N integers. Print the smallest value.',
    'First line N, second line N integers.',
    'Print one integer: minimum element.',
    'Track min while scanning array.',
    `5\n${arr.join(' ')}`,
    String(Math.min(...arr)),
    [
      { input: '3\n9 9 9', expectedOutput: '9' },
      { input: '4\n-5 3 0 2', expectedOutput: '-5' },
    ],
  );
}

function buildFirstLastSum(variant: number): ProgrammingProblem {
  const arr = [variant + 3, 5, 7, 9, variant + 1];
  const out = arr[0] + arr[arr.length - 1];
  return makeProblem(
    `tech-first-last-sum-${variant}`,
    `First + Last Sum #${variant + 1}`,
    'Read N and N integers. Print sum of first and last element.',
    'First line N, second line N integers (N >= 1).',
    'Print one integer.',
    'Access index 0 and index N-1.',
    `5\n${arr.join(' ')}`,
    String(out),
    [
      { input: '1\n42', expectedOutput: '84' },
      { input: '3\n4 5 6', expectedOutput: '10' },
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
    'Read N, K and N integers. Print count of numbers divisible by K.',
    'First line N K. Second line N integers.',
    'Print one integer count.',
    'For each number, check num % K == 0.',
    `5 ${k}\n${arr.join(' ')}`,
    String(cnt),
    [
      { input: '4 3\n3 6 7 8', expectedOutput: '2' },
      { input: '5 10\n1 2 3 4 5', expectedOutput: '0' },
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

const VARIANTS_PER_BUILDER = 50; // 12 * 50 = 600 problems

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

export function buildTechnicalCodingProblems(seed: string): ProgrammingProblem[] {
  const rng = forkRng(seed, 'placement-tech-coding');
  const copy = [...TECHNICAL_CODING_BANK];
  shuffleInPlace(copy, rng);
  return copy.slice(0, 3);
}

