import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import {
  getExamDetails,
  parseSubjectSelections,
  resolveSubjectMappings,
  validateExamInput,
} from '@/lib/exams/exam-builder-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin', 'student'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const exam = await getExamDetails(id);
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  return NextResponse.json({ exam });
}

export async function PUT(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validationError = validateExamInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const title = String(body.title).trim();
  const description = String(body.description ?? '').trim() || null;
  const duration = Number(body.duration);
  const totalMarks = Number(body.total_marks);
  const passingMarks = Number(body.passing_marks);
  const startTime = new Date(String(body.start_time));
  const endTime = new Date(String(body.end_time));
  const status = String(body.status ?? 'draft').trim().toLowerCase() || 'draft';

  try {
    const mappings = await resolveSubjectMappings(parseSubjectSelections(body));
    await prisma.$transaction([
      prisma.exam.update({
        where: { id },
        data: {
          title,
          description,
          duration,
          totalMarks,
          passingMarks,
          startTime,
          endTime,
          status,
        },
      }),
      prisma.examSubject.deleteMany({ where: { examId: id } }),
      prisma.examSubject.createMany({
        data: mappings.map((row) => ({
          examId: id,
          subjectId: row.subjectId,
          assessmentFormat: row.assessmentFormat,
        })),
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update exam';
    if (/record to update not found/i.test(message)) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: 'Exam title already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  try {
    await prisma.exam.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete exam';
    if (/record to delete does not exist/i.test(message)) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
