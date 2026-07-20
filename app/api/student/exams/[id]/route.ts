import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getExamDetails } from '@/lib/exams/exam-builder-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuth(['student'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const exam = await getExamDetails(id);
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      total_marks: exam.total_marks,
      passing_marks: exam.passing_marks,
      start_time: exam.start_time,
      end_time: exam.end_time,
      subjects: exam.subjects,
    },
  });
}
