import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  adminContestProblems,
  adminContestStudentReport,
  adminContestStudents,
  adminContestSubmissions,
  adminContestSummary,
  adminPublishContest,
} from '@/lib/dsa/contest/admin-analytics';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ contestId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  const { contestId } = await ctx.params;
  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'summary';
  const attemptId = url.searchParams.get('attemptId');
  try {
    if (view === 'students') {
      return NextResponse.json({ students: await adminContestStudents(contestId) });
    }
    if (view === 'problems') {
      return NextResponse.json({ problems: await adminContestProblems(contestId) });
    }
    if (view === 'submissions') {
      return NextResponse.json({ submissions: await adminContestSubmissions(contestId) });
    }
    if (view === 'report') {
      if (!attemptId) {
        return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });
      }
      return NextResponse.json({
        report: await adminContestStudentReport(contestId, attemptId),
      });
    }
    return NextResponse.json(await adminContestSummary(contestId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  const { contestId } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* optional body */
  }
  try {
    if (body.action === 'publish') {
      const contest = await adminPublishContest(contestId);
      return NextResponse.json({ contest });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}
