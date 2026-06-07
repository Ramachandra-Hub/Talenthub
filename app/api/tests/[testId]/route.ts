import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';

/** Legacy test API — admin only. Students must use /api/student/tests/[testId]. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  return NextResponse.json(
    {
      error:
        'This legacy endpoint is restricted to admins. Use the student portal APIs for examinations.',
    },
    { status: 410 },
  );
}
