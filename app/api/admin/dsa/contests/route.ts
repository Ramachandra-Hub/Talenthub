import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  adminContestOverview,
  adminListContests,
} from '@/lib/dsa/contest/admin-analytics';

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
    return NextResponse.json({ contests: await adminListContests() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
