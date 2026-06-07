import { NextResponse } from 'next/server';
import { executeCode } from '@/lib/coding/execute';
import { parseCodingRunRequest } from '@/lib/coding/parse-run-request';
import { requireAuth } from '@/lib/server-auth';
import { rateLimitInMemory } from '@/lib/rate-limit';
import type { CodingLanguageId } from '@/lib/coding/languages';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_CASES = 12;
const CONCURRENCY = 3;

async function runPool(
  language: CodingLanguageId,
  sourceCode: string,
  inputs: string[],
): Promise<
  Array<{
    stdout: string;
    stderr: string;
    exitCode: number;
    runtimeMs: number;
    engine?: string;
    error?: string;
  }>
> {
  const results: Array<{
    stdout: string;
    stderr: string;
    exitCode: number;
    runtimeMs: number;
    engine?: string;
    error?: string;
  }> = new Array(inputs.length);

  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const i = next++;
      const stdin = inputs[i] ?? '';
      try {
        const out = await executeCode(language, sourceCode, stdin);
        results[i] = {
          stdout: out.stdout,
          stderr: out.stderr,
          exitCode: out.exitCode,
          runtimeMs: out.runtimeMs,
          engine: out.engine,
        };
      } catch (error) {
        results[i] = {
          stdout: '',
          stderr: '',
          exitCode: 1,
          runtimeMs: 0,
          error: error instanceof Error ? error.message : 'Execution failed',
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, inputs.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  const authResult = await requireAuth(['student', 'admin'], request);
  if ('response' in authResult) return authResult.response;

  const burst = rateLimitInMemory(`coding-batch:${authResult.ctx.user.id}`, 20, 60_000);
  if (!burst.ok) {
    return NextResponse.json(
      { error: 'Too many batch runs. Wait a moment and try again.', retryAfterSec: burst.retryAfterSec },
      { status: 429 },
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    if (!record) {
      return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
    }

    const parsed = parseCodingRunRequest({
      language: record.language,
      sourceCode: record.sourceCode,
      stdin: '',
    });
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const rawInputs = record.inputs ?? record.testCases;
    if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
      return NextResponse.json({ error: 'inputs array required' }, { status: 400 });
    }
    if (rawInputs.length > MAX_CASES) {
      return NextResponse.json(
        { error: `At most ${MAX_CASES} test cases per batch` },
        { status: 400 },
      );
    }

    const inputs = rawInputs.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && typeof (item as { input?: string }).input === 'string') {
        return (item as { input: string }).input;
      }
      return '';
    });

    const results = await runPool(parsed.language, parsed.sourceCode, inputs);

    return NextResponse.json({ results, engine: results[0]?.engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Batch execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
