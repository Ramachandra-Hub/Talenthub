import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { submitDsaCode, httpErrorStatus } from '@/lib/dsa/service';
import { rateLimitInMemory } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;
  const limited = rateLimitInMemory(`dsa-code:${auth.ctx.user.id}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const data = await submitDsaCode({
      userId: auth.ctx.user.id,
      problemId: String(body.problemId ?? ''),
      language: String(body.language ?? ''),
      sourceCode: String(body.sourceCode ?? ''),
    });
    return NextResponse.json(data);
  } catch (err) {
    const status = httpErrorStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not grade submission' },
      { status: status === 500 ? 500 : status },
    );
  }
}
