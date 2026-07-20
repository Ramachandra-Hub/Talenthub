import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import { listSubjects, slugifySubjectName } from '@/lib/exams/exam-builder-service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin', 'student'], request);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const search = String(searchParams.get('search') ?? '').trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? 100)));

  const { rows, total } = await listSubjects(search, page, pageSize);
  return NextResponse.json({ subjects: rows, total, page, pageSize });
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

  const subjectName = String(body.subject_name ?? '').trim();
  if (!subjectName) {
    return NextResponse.json({ error: 'subject_name is required' }, { status: 400 });
  }
  const slug = slugifySubjectName(subjectName);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid subject name' }, { status: 400 });
  }
  const status = String(body.status ?? 'active').trim().toLowerCase() || 'active';

  try {
    const created = await prisma.subject.create({
      data: { subjectName, slug, status },
      select: { id: true, subjectName: true, slug: true, status: true },
    });
    return NextResponse.json({
      subject: {
        id: created.id,
        subject_name: created.subjectName,
        slug: created.slug,
        status: created.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create subject';
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: 'Subject already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
