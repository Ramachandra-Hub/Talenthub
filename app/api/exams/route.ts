import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import {
  listExams,
  parseSubjectSelections,
  resolveSubjectMappings,
  validateExamInput,
} from '@/lib/exams/exam-builder-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin', 'student'], request);
  if ('response' in auth) return auth.response;

  const exams = await listExams();
  return NextResponse.json({ exams });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

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
    const created = await prisma.exam.create({
      data: {
        title,
        description,
        duration,
        totalMarks,
        passingMarks,
        startTime,
        endTime,
        status,
        createdBy: auth.ctx.user.id,
        subjects: {
          createMany: {
            data: mappings.map((row) => ({
              subjectId: row.subjectId,
              assessmentFormat: row.assessmentFormat,
            })),
          },
        },
      },
      select: { id: true },
    });
    return NextResponse.json({ examId: created.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create exam';
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: 'Exam title already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
