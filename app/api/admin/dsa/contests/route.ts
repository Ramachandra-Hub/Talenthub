import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  adminContestOverview,
  adminListContests,
} from '@/lib/dsa/contest/admin-analytics';
import {
  adminCreateContest,
  adminListContestBankProblems,
} from '@/lib/dsa/contest/admin-mutate';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  try {
    if (view === 'overview') {
      return NextResponse.json(await adminContestOverview());
    }
    if (view === 'bank') {
      return NextResponse.json({ problems: await adminListContestBankProblems() });
    }
    return NextResponse.json({ contests: await adminListContests() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      instructions?: string | null;
      durationMinutes?: number;
      problemIds?: string[];
    };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    const created = await adminCreateContest({
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      durationMinutes: body.durationMinutes,
      problemIds: body.problemIds,
    });
    return NextResponse.json({ contest: created }, { status: 201 });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status },
    );
  }
}
