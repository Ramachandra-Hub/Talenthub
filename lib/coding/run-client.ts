import type { CodingLanguageId } from '@/lib/coding/languages';
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
  const res = await fetch('/api/v2/coding/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, sourceCode, stdin }),
  });
  const data = (await res.json()) as CodingRunResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Run failed');
  }
  return data;
}

export function formatCodingRunOutput(data: CodingRunResponse): string {
  const parts: string[] = [];
  if (data.engine) parts.push(`Engine: ${data.engine}`);
  if (data.runtimeMs !== undefined) parts.push(`${data.runtimeMs}ms`);
  if (data.exitCode !== undefined) parts.push(`exit ${data.exitCode}`);
  const meta = parts.length ? `${parts.join(' · ')}\n\n` : '';

  const body = [
    data.stdout != null && data.stdout !== '' ? `stdout:\n${data.stdout}` : null,
    data.stderr ? `stderr:\n${data.stderr}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return meta + (body || '(no output)');
}

export async function runCodingBatchOnServer(
  language: CodingLanguageId,
  sourceCode: string,
  inputs: string[],
): Promise<CodingRunResponse[]> {
  const res = await fetch('/api/v2/coding/run-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, sourceCode, inputs }),
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
