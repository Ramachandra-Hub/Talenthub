import { executeCode } from '@/lib/coding/execute';
import { parseStoredCodingProblem } from '@/lib/coding/coding-bank-persist';
import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import { outputsMatch, type ProgrammingTestCase } from '@/lib/coding/sample-problems';
import { getProgrammingProblemById } from '@/lib/exam-builder/programming-syllabus';
import type { Question } from '@/lib/types';

export type CodingGradeResult = {
  passed: number;
  total: number;
  fraction: number;
  compileOk: boolean;
};

function parseCodingPayload(
  raw: string | null | undefined,
): { language: CodingLanguageId; sourceCode: string } | null {
  if (raw == null || String(raw).trim() === '') return null;
  try {
    const parsed = JSON.parse(String(raw)) as { language?: string; sourceCode?: string };
    if (typeof parsed.sourceCode !== 'string') return null;
    const language = getCodingLanguage(parsed.language ?? 'java').id;
    return { language, sourceCode: parsed.sourceCode };
  } catch {
    return null;
  }
}

export function casesForQuestion(question: Question): ProgrammingTestCase[] {
  const problem = question.coding_problem_id
    ? getProgrammingProblemById(question.coding_problem_id)
    : undefined;
  if (problem?.testCases?.length) return problem.testCases;
  if (question.coding_test_cases?.length) return question.coding_test_cases;
  const stored = parseStoredCodingProblem(question.explanation);
  if (stored?.problem.testCases?.length) return stored.problem.testCases;
  const input = problem?.sampleInput ?? stored?.problem.sampleInput ?? question.coding_sample_input ?? '';
  const expectedOutput =
    problem?.sampleOutput ?? stored?.problem.sampleOutput ?? question.coding_sample_output ?? '';
  if (!input.trim() || !expectedOutput.trim()) return [];
  return [{ input, expectedOutput }];
}

/** Grade one coding answer against sample + hidden cases. Compile/runtime errors score 0. */
export async function gradeCodingAnswerOnServer(
  question: Question,
  userAnswer: string | null | undefined,
): Promise<CodingGradeResult> {
  const cases = casesForQuestion(question);
  const total = Math.max(cases.length, 1);
  const payload = parseCodingPayload(userAnswer);
  if (!payload?.sourceCode.trim()) {
    return { passed: 0, total, fraction: 0, compileOk: false };
  }
  if (!cases.length) {
    return { passed: 0, total: 1, fraction: 0, compileOk: false };
  }

  let passed = 0;
  let compileOk = true;
  try {
    for (const testCase of cases) {
      const result = await executeCode(payload.language, payload.sourceCode, testCase.input);
      if (result.exitCode !== 0) {
        compileOk = false;
        const err = `${result.stderr ?? ''} ${result.stdout ?? ''}`.toLowerCase();
        const compileFailed =
          !String(result.stdout ?? '').trim() &&
          (err.includes('error:') ||
            err.includes('compilation') ||
            err.includes('cannot find symbol') ||
            err.includes('syntax error') ||
            err.includes('exception in thread') ||
            err.includes('error: could not find or load'));
        if (compileFailed) {
          return { passed: 0, total: cases.length, fraction: 0, compileOk: false };
        }
        continue;
      }
      const actual = (result.stdout ?? '').trim();
      if (outputsMatch(actual, testCase.expectedOutput)) passed += 1;
    }
  } catch {
    return { passed: 0, total: cases.length, fraction: 0, compileOk: false };
  }

  return {
    passed,
    total: cases.length,
    fraction: cases.length > 0 ? passed / cases.length : 0,
    compileOk,
  };
}

/** True only when every test case passes with a successful compile/run. */
export async function isCodingAnswerCorrectOnServer(
  question: Question,
  userAnswer: string | null | undefined,
): Promise<boolean> {
  const grade = await gradeCodingAnswerOnServer(question, userAnswer);
  return grade.fraction === 1 && grade.compileOk;
}
