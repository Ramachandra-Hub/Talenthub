import { NextRequest, NextResponse } from 'next/server';
import { getOpenExamByToken } from '@/lib/exams/open-exam-link';

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const { token } = await context.params;
  try {
    const exam = await getOpenExamByToken(token);
    if (!exam) {
      return NextResponse.json({ error: 'This exam link is invalid or not published.' }, { status: 404 });
    }
    return NextResponse.json({
      title: exam.title,
      duration: exam.duration,
      defaultPasswordHint: exam.defaultPassword,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load exam link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
