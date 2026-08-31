import { executeCode } from '@/lib/coding/execute';
import { outputsMatch } from '@/lib/coding/sample-problems';
import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';
import type { DsaTestCase } from '@/lib/dsa/types';

export type DsaGradeResult = {
  passed: number;
  total: number;
  fraction: number;
  compileOk: boolean;
  runtimeMs: number;
  stderr: string;
  stdout: string;
  publicResults: Array<{ passed: boolean; stderr?: string }>;
};

export function parseTestCases(raw: unknown): DsaTestCase[] {
  if (!Array.isArray(raw)) return [];
  const out: DsaTestCase[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const input = String(r.input ?? '');
    const expectedOutput = String(r.expectedOutput ?? r.expected_output ?? '');
    if (!expectedOutput && !input) continue;
    out.push({
      input,
      expectedOutput,
      hidden: Boolean(r.hidden),
      explanation: typeof r.explanation === 'string' ? r.explanation : undefined,
    });
  }
  return out;
}

export async function gradeDsaSource(input: {
  language: string;
  sourceCode: string;
  testCases: DsaTestCase[];
}): Promise<DsaGradeResult> {
  const language: CodingLanguageId = isCodingLanguageId(input.language)
    ? input.language
    : 'java';
  const cases = input.testCases.length
    ? input.testCases
    : [{ input: '', expectedOutput: '', hidden: false }];
  let passed = 0;
  let compileOk = true;
  let runtimeMs = 0;
  let stderr = '';
  let stdout = '';
  const publicResults: Array<{ passed: boolean; stderr?: string }> = [];

  for (const testCase of cases) {
    const result = await executeCode(language, input.sourceCode, testCase.input);
    runtimeMs += result.runtimeMs;
    const ok =
      result.exitCode === 0 &&
      !result.stderr.trim() &&
      outputsMatch(result.stdout, testCase.expectedOutput);
    if (result.exitCode !== 0 || /error/i.test(result.stderr)) compileOk = compileOk && result.exitCode === 0;
    if (ok) passed += 1;
    else {
      stderr = result.stderr || stderr;
      stdout = result.stdout || stdout;
    }
    if (!testCase.hidden) {
      publicResults.push({
        passed: ok,
        stderr: ok ? undefined : (result.stderr || 'Wrong answer on a sample test').slice(0, 400),
      });
    }
  }

  const total = cases.length;
  return {
    passed,
    total,
    fraction: total > 0 ? passed / total : 0,
    compileOk,
    runtimeMs,
    stderr,
    stdout,
    publicResults,
  };
}
