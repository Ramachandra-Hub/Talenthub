import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { listDsaHardOpenAttemptsForAdmin } from '@/lib/exams/dsa-hard-open';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ examId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  const { examId } = await ctx.params;
  try {
    const attempts = await listDsaHardOpenAttemptsForAdmin(examId);
    return NextResponse.json({ attempts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load attempts' },
      { status: 500 },
    );
  }
}
