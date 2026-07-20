import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ examId: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin', 'student'], request);
  if ('response' in auth) return auth.response;

  const { examId } = await context.params;
  const rows = await prisma.examSubject.findMany({
    where: { examId },
    include: {
      subject: {
        select: { id: true, subjectName: true, slug: true, status: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    exam_id: examId,
    subjects: rows.map((r) => ({
      id: r.subject.id,
      subject_name: r.subject.subjectName,
      slug: r.subject.slug,
      status: r.subject.status,
      assessment_format: r.assessmentFormat,
    })),
  });
}
