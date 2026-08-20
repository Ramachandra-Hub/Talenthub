import type { CodingLanguageId } from '@/lib/coding/languages';
import { fetchWithSession } from '@/lib/client-auth';
import { outputsMatch } from '@/lib/coding/sample-problems';

export type CodingRunResponse = {
  stdout?: string;
  stderr?: string;
  error?: string;
  exitCode?: number;
  runtimeMs?: number;
  memoryKb?: number | null;
  engine?: string;
};

export async function runCodingOnServer(
  language: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<CodingRunResponse> {
  const res = await fetchWithSession('/api/v2/coding/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, sourceCode, stdin }),
    cache: 'no-store',
  });
  const data = (await res.json()) as CodingRunResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Run failed');
  }
  return data;
}

export function formatCodingRunOutput(data: CodingRunResponse): string {
  const body = [
    data.stdout != null && String(data.stdout).length > 0 ? `stdout:\n${data.stdout}` : null,
    data.stderr ? `stderr:\n${data.stderr}` : null,
    data.error ? `error:\n${data.error}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return body || '(no output)';
}

export async function runCodingBatchOnServer(
  language: CodingLanguageId,
  sourceCode: string,
  inputs: string[],
): Promise<CodingRunResponse[]> {
  const res = await fetchWithSession('/api/v2/coding/run-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, sourceCode, inputs }),
    cache: 'no-store',
  });
  const data = (await res.json()) as {
    results?: CodingRunResponse[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? 'Batch run failed');
  }
  return data.results ?? [];
}

export function gradeCodingTestCase(
  data: CodingRunResponse,
  expectedOutput: string,
): { pass: boolean; actual: string } {
  const actual = (data.stdout ?? '').trim();
  const pass =
    (data.exitCode === undefined || data.exitCode === 0) &&
    outputsMatch(actual, expectedOutput);
  return { pass, actual };
}
