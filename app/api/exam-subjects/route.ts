import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const examId = String(body.exam_id ?? '').trim();
  const subjectIds = Array.isArray(body.subject_ids)
    ? [...new Set((body.subject_ids as unknown[]).map((x) => String(x).trim()).filter(Boolean))]
    : [];
  if (!examId) return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
  if (!subjectIds.length) return NextResponse.json({ error: 'subject_ids cannot be empty' }, { status: 400 });

  try {
    const created = await prisma.examSubject.createMany({
      data: subjectIds.map((subjectId) => ({ examId, subjectId })),
      skipDuplicates: true,
    });
    return NextResponse.json({ inserted: created.count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create mappings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
