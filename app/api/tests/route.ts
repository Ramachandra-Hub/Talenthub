import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';

/** Legacy tests list — admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  return NextResponse.json(
    { error: 'Use /api/admin/tests-overview for admin test management.' },
    { status: 410 },
  );
}
