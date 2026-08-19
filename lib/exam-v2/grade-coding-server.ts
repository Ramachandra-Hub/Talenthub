import { executeCode } from '@/lib/coding/execute';
import { parseStoredCodingProblem } from '@/lib/coding/coding-bank-persist';
import { getCodingLanguage, type CodingLanguageId } from '@/lib/coding/languages';
import { outputsMatch, type ProgrammingTestCase } from '@/lib/coding/sample-problems';
import { getProgrammingProblemById } from '@/lib/exam-builder/programming-syllabus';
import { computeCodingRubric, type CodingRubricReport } from '@/lib/exam-v2/coding-rubric';
import type { Question } from '@/lib/types';

export type CodingGradeResult = {
  passed: number;
  total: number;
  fraction: number;
  compileOk: boolean;
  rubric: CodingRubricReport;
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

function buildGradeResult(input: {
  passed: number;
  total: number;
  compileOk: boolean;
  sourceCode: string;
  hadCompileError: boolean;
  hadRuntimeError: boolean;
  maxRuntimeMs?: number;
}): CodingGradeResult {
  const rubric = computeCodingRubric(input);
  const fraction = rubric.totalEarned / 100;
  return {
    passed: input.passed,
    total: input.total,
    fraction,
    compileOk: input.compileOk,
    rubric,
  };
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
    return buildGradeResult({
      passed: 0,
      total,
      compileOk: false,
      sourceCode: '',
      hadCompileError: false,
      hadRuntimeError: false,
    });
  }
  if (!cases.length) {
    return buildGradeResult({
      passed: 0,
      total: 1,
      compileOk: false,
      sourceCode: payload.sourceCode,
      hadCompileError: false,
      hadRuntimeError: false,
    });
  }

  let passed = 0;
  let compileOk = true;
  let hadCompileError = false;
  let hadRuntimeError = false;
  let maxRuntimeMs = 0;
  try {
    for (const testCase of cases) {
      const result = await executeCode(payload.language, payload.sourceCode, testCase.input);
      maxRuntimeMs = Math.max(maxRuntimeMs, result.runtimeMs ?? 0);
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
          hadCompileError = true;
          return buildGradeResult({
            passed: 0,
            total: cases.length,
            compileOk: false,
            sourceCode: payload.sourceCode,
            hadCompileError: true,
            hadRuntimeError: false,
            maxRuntimeMs,
          });
        }
        hadRuntimeError = true;
        continue;
      }
      const actual = (result.stdout ?? '').trim();
      if (outputsMatch(actual, testCase.expectedOutput)) passed += 1;
    }
  } catch {
    return buildGradeResult({
      passed: 0,
      total: cases.length,
      compileOk: false,
      sourceCode: payload.sourceCode,
      hadCompileError: true,
      hadRuntimeError: false,
      maxRuntimeMs,
    });
  }

  return buildGradeResult({
    passed,
    total: cases.length,
    compileOk,
    sourceCode: payload.sourceCode,
    hadCompileError,
    hadRuntimeError,
    maxRuntimeMs,
  });
}

/** True only when every test case passes with a successful compile/run. */
export async function isCodingAnswerCorrectOnServer(
  question: Question,
  userAnswer: string | null | undefined,
): Promise<boolean> {
  const grade = await gradeCodingAnswerOnServer(question, userAnswer);
  return grade.fraction === 1 && grade.compileOk;
}
