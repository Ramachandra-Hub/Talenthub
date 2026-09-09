import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  adminEndContest,
  adminPublishContest,
  adminUnpublishContest,
  adminUpdateContest,
} from '@/lib/dsa/contest/admin-mutate';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ contestId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  const { contestId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      action?: 'publish' | 'activate' | 'unpublish' | 'end' | 'update';
      title?: string;
      description?: string | null;
      instructions?: string | null;
      durationMinutes?: number;
      problemIds?: string[];
      status?: 'draft' | 'published' | 'active' | 'ended';
      startsAt?: string | null;
      endsAt?: string | null;
    };

    if (body.action === 'publish' || body.action === 'activate') {
      const contest = await adminPublishContest(contestId, body.action === 'activate');
      return NextResponse.json({ contest });
    }
    if (body.action === 'unpublish') {
      const contest = await adminUnpublishContest(contestId);
      return NextResponse.json({ contest });
    }
    if (body.action === 'end') {
      const contest = await adminEndContest(contestId);
      return NextResponse.json({ contest });
    }

    const contest = await adminUpdateContest(contestId, {
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      durationMinutes: body.durationMinutes,
      problemIds: body.problemIds,
      status: body.status,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    });
    return NextResponse.json({ contest });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status },
    );
  }
}
