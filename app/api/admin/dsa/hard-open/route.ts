import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  createAndPublishDsaHardOpenExam,
  listDsaHardOpenExams,
} from '@/lib/exams/dsa-hard-open';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  try {
    const exams = await listDsaHardOpenExams();
    return NextResponse.json({ exams });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list open coding exams' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      durationMinutes?: number;
      password?: string;
    };
    const created = await createAndPublishDsaHardOpenExam({
      adminUserId: auth.ctx.user.id,
      title: body.title,
      durationMinutes: body.durationMinutes,
      password: body.password,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create open coding exam' },
      { status: 400 },
    );
  }
}
