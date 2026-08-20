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

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 180);
    return {
      error:
        res.status === 504 || /gateway timeout|an error occurred/i.test(snippet)
          ? 'Compile timed out. Click Compile & run again in a few seconds.'
          : snippet || `Request failed (${res.status})`,
    };
  }
}

export async function runCodingOnServer(
  language: CodingLanguageId,
  sourceCode: string,
  stdin: string,
): Promise<CodingRunResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const res = await fetchWithSession('/api/v2/coding/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, sourceCode, stdin }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = (await readJsonSafe(res)) as CodingRunResponse;
    if (!res.ok) {
      return {
        stdout: '',
        stderr: data.error ?? `Run failed (HTTP ${res.status}). Click Compile & run again.`,
        exitCode: 1,
        engine: 'fallback',
        error: data.error,
      };
    }
    return data;
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      stdout: '',
      stderr: aborted
        ? 'Compile timed out. Click Compile & run again.'
        : err instanceof Error
          ? err.message
          : 'Run failed. Click Compile & run again.',
      exitCode: 1,
      engine: 'fallback',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function formatCodingRunOutput(data: CodingRunResponse): string {
  const body = [
    data.stdout != null && String(data.stdout).length > 0 ? `stdout:\n${data.stdout}` : null,
    data.stderr ? `stderr:\n${data.stderr}` : null,
    data.error && !data.stderr ? `error:\n${data.error}` : null,
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
  const data = (await readJsonSafe(res)) as {
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
