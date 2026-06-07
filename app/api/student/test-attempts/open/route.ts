import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { findOpenAttemptForTestPrisma } from '@/lib/db/test-attempts-prisma';

export const dynamic = 'force-dynamic';

/** GET — in-progress attempt snapshot for draft merge on exam resume. */
export async function GET(request: Request) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const url = new URL(request.url);
  const testId = url.searchParams.get('testId')?.trim() ?? '';
  if (!testId) {
    return NextResponse.json({ error: 'testId query parameter is required' }, { status: 400 });
  }

  const openAttempt = await findOpenAttemptForTestPrisma(auth.ctx.user.id, testId);
  return NextResponse.json({ openAttempt });
}
