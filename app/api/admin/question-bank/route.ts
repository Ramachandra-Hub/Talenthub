import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  buildQuestionBankCsv,
  QUESTION_BANK_SECTION_LABELS,
  sectionKeyForTopicSlug,
  type QuestionBankExportRow,
  type QuestionBankRow,
} from '@/lib/admin/question-bank-catalog';
import {
  loadFullQuestionBankForExportPrisma,
  loadQuestionBankOverviewPrisma,
  loadQuestionsForTopicPrisma,
} from '@/lib/admin/question-bank-catalog-prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadTopicExportRows(
  topicSlug: string,
): Promise<{ rows: QuestionBankExportRow[]; topicName: string; sectionName: string }> {
  const allRows: QuestionBankRow[] = [];
  let pageOffset = 0;
  const pageSize = 500;
  let topicName = topicSlug;
  let total = 0;

  for (;;) {
    const batch = await loadQuestionsForTopicPrisma(topicSlug, {
      offset: pageOffset,
      limit: pageSize,
    });
    if (!batch.topic) {
      throw new Error('Topic not found');
    }
    topicName = batch.topic.name;
    total = batch.total;
    allRows.push(...batch.questions);
    if (allRows.length >= total || batch.questions.length < pageSize) break;
    pageOffset += pageSize;
  }

  const sectionName =
    topicSlug === 'uncategorized'
      ? QUESTION_BANK_SECTION_LABELS.uncategorized
      : QUESTION_BANK_SECTION_LABELS[sectionKeyForTopicSlug(topicSlug)];

  const rows: QuestionBankExportRow[] = allRows.map((q) => ({
    ...q,
    section: sectionName,
    topic: topicName,
  }));

  return { rows, topicName, sectionName };
}

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const topicSlug = searchParams.get('topicSlug')?.trim() ?? '';
  const exportFormat = searchParams.get('export')?.trim() ?? '';
  const exportAll = searchParams.get('all') === '1' || searchParams.get('scope') === 'all';
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0);
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? 100) || 100), 500);

  try {
    if ((exportFormat === 'csv' || exportFormat === 'json') && (!topicSlug || exportAll)) {
      const rows = await loadFullQuestionBankForExportPrisma();
      if (exportFormat === 'json') {
        return NextResponse.json({ rows, total: rows.length });
      }
      const csv = buildQuestionBankCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="question-bank-full-${stamp}.csv"`,
        },
      });
    }

    if (!topicSlug) {
      const overview = await loadQuestionBankOverviewPrisma();
      return NextResponse.json(overview);
    }

    if (exportFormat === 'csv' || exportFormat === 'json') {
      const { rows, topicName } = await loadTopicExportRows(topicSlug);
      if (exportFormat === 'json') {
        return NextResponse.json({ rows, total: rows.length, topic: topicName });
      }
      const csv = buildQuestionBankCsv(rows);
      const slugPart = topicSlug.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="question-bank-${slugPart}.csv"`,
        },
      });
    }

    const payload = await loadQuestionsForTopicPrisma(topicSlug, { offset, limit });
    if (!payload.topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question bank';
    if (message === 'Topic not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
