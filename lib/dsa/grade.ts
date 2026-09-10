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
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: DsaTestCase[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const input = String(r.input ?? '');
    const expectedOutput = String(r.expectedOutput ?? r.expected_output ?? '');
    // Need a real expected answer — empty expected would auto-pass empty programs.
    if (!expectedOutput.trim()) continue;
    out.push({
      input,
      expectedOutput,
      hidden: Boolean(r.hidden),
      explanation: typeof r.explanation === 'string' ? r.explanation : undefined,
    });
  }
  return out;
}

function clip(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function gradeDsaSource(input: {
  language: string;
  sourceCode: string;
  testCases: DsaTestCase[];
}): Promise<DsaGradeResult> {
  const language: CodingLanguageId = isCodingLanguageId(input.language)
    ? input.language
    : 'java';
  const cases = input.testCases;

  if (!cases.length) {
    return {
      passed: 0,
      total: 1,
      fraction: 0,
      compileOk: false,
      runtimeMs: 0,
      stderr: 'No test cases configured for this problem.',
      stdout: '',
      publicResults: [
        {
          passed: false,
          stderr: 'No test cases configured for this problem.',
        },
      ],
    };
  }

  let passed = 0;
  let compileOk = true;
  let runtimeMs = 0;
  let stderr = '';
  let stdout = '';
  const publicResults: Array<{ passed: boolean; stderr?: string }> = [];

  for (const testCase of cases) {
    const result = await executeCode(language, input.sourceCode, testCase.input);
    runtimeMs += result.runtimeMs;
    const matched = outputsMatch(result.stdout ?? '', testCase.expectedOutput);
    // exit 0 + matching stdout. Ignore benign JVM stderr noise.
    const ok = result.exitCode === 0 && matched;

    if (result.exitCode !== 0) compileOk = false;
    if (ok) passed += 1;
    else {
      stderr = result.stderr || stderr;
      stdout = result.stdout || stdout;
    }
    if (!testCase.hidden) {
      let failMsg: string | undefined;
      if (!ok) {
        if (result.exitCode !== 0) {
          failMsg = clip(result.stderr || result.stdout || 'Runtime / compile error');
        } else {
          failMsg = `Wrong answer. Expected: ${clip(testCase.expectedOutput, 80)} · Got: ${clip(
            result.stdout || '(empty)',
            80,
          )}`;
        }
      }
      publicResults.push({
        passed: ok,
        stderr: failMsg,
      });
    }
  }

  // Always surface at least one public result row so the UI can show Passed/Failed.
  if (publicResults.length === 0 && cases.length > 0) {
    publicResults.push({
      passed: passed === cases.length,
      stderr:
        passed === cases.length
          ? undefined
          : clip(stderr || stdout || 'One or more hidden tests failed'),
    });
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
