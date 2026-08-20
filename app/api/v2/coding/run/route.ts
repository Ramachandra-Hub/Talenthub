import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { executeCode } from '@/lib/coding/execute';
import { parseCodingRunRequest } from '@/lib/coding/parse-run-request';
import { requireAuth } from '@/lib/server-auth';
import { auth } from '@/auth';
import { useAwsStack } from '@/lib/aws/stack';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const authResult = await requireAuth(['student', 'admin'], request);
  if ('response' in authResult) return authResult.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = parseCodingRunRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { language, sourceCode, stdin } = parsed;
    const result = await executeCode(language, sourceCode, stdin);

    // Optional run log (never block execution on DB / schema errors)
    try {
      const service = getDbService();
      let userId: string | undefined;
      if (useAwsStack()) {
        userId = (await auth())?.user?.id;
      } else {
        userId = (await service.auth.getUser('')).data.user?.id;
      }
      if (service && userId) {
        await service.from('coding_submissions').insert({
          user_id: userId,
          language,
          source_code: sourceCode,
          stdin: stdin || null,
          stdout: result.stdout,
          stderr: result.stderr,
          status: result.exitCode === 0 ? 'accepted' : 'error',
          runtime_ms: result.runtimeMs,
          memory_kb: result.memoryKb,
        });
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      engine: result.engine,
    });
  } catch (error) {
    // Never hard-fail the exam UI with a raw 500 for runner/infra issues.
    const message = error instanceof Error ? error.message : 'Execution failed';
    console.error('[coding/run]', message, error);
    return NextResponse.json(
      {
        stdout: '',
        stderr: `${message}\n\nClick Compile & run again.`,
        exitCode: 1,
        runtimeMs: 0,
        memoryKb: null,
        engine: 'fallback',
        error: message,
      },
      { status: 200 },
    );
  }
}
