import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { prisma } from '@/lib/prisma';
import {
  listOpenLinkEntries,
  openLinkEntriesToXlsxBuffer,
  resolveOpenLinkPassword,
} from '@/lib/exams/open-exam-link';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    select: { title: true, openLinkEnabled: true, openLinkPassword: true },
  });
  if (!exam?.openLinkEnabled) {
    return NextResponse.json({ error: 'Open link is not enabled for this exam.' }, { status: 404 });
  }

  const rows = await listOpenLinkEntries(id);
  const buf = openLinkEntriesToXlsxBuffer(
    exam.title,
    resolveOpenLinkPassword(exam.openLinkPassword),
    rows,
  );
  const filename = `${exam.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'exam'}-open-link.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
