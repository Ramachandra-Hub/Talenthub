import { prisma } from '@/lib/prisma';
import { normalizeQuestionId } from '@/lib/exam-builder/id-utils';
import type { ResolvedSyllabusTopic } from '@/lib/exam-builder/draw-questions';
import {
  QUESTION_BANK_SECTION_LABELS,
  sectionKeyForTopicSlug,
  type QuestionBankExportRow,
  type QuestionBankOverview,
  type QuestionBankRow,
  type QuestionBankSectionKey,
  type QuestionBankSectionSummary,
  type QuestionBankTopicSummary,
} from '@/lib/admin/question-bank-catalog';

function rowToBankQuestion(row: {
  id: string;
  questionText: string;
  difficulty: string | null;
  type: string | null;
  questionType: string | null;
  correctAnswer: string;
  explanation: string | null;
  options: unknown;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  tags: unknown;
  categoryId: string | null;
  createdAt: Date;
}): QuestionBankRow {
  let options: string[] | null = null;
  if (Array.isArray(row.options)) {
    options = row.options.map(String);
  }
  let tags: string[] | null = null;
  if (Array.isArray(row.tags)) {
    tags = row.tags.map(String);
  }

  return {
    id: normalizeQuestionId(row.id),
    question_text: row.questionText,
    difficulty: row.difficulty ?? 'medium',
    type: row.type ?? row.questionType ?? 'MCQ',
    correct_answer: row.correctAnswer,
    explanation: row.explanation,
    options,
    option_a: row.optionA,
    option_b: row.optionB,
    option_c: row.optionC,
    option_d: row.optionD,
    tags,
    category_id: row.categoryId,
    created_at: row.createdAt.toISOString(),
  };
}

async function loadTagLinkCountsPrisma(): Promise<Map<string, number>> {
  const groups = await prisma.questionTagLink.groupBy({
    by: ['tagId'],
    _count: { questionId: true },
  });
  return new Map(groups.map((g) => [g.tagId, g._count.questionId]));
}

async function loadAllTaggedQuestionIdsPrisma(): Promise<Set<string>> {
  const links = await prisma.questionTagLink.findMany({ select: { questionId: true } });
  return new Set(links.map((l) => l.questionId));
}

async function countUncategorizedQuestionsPrisma(taggedIds: Set<string>): Promise<number> {
  const all = await prisma.question.findMany({ select: { id: true } });
  return all.filter((q) => !taggedIds.has(q.id)).length;
}

export async function loadQuestionBankOverviewPrisma(): Promise<QuestionBankOverview> {
  const { ensureCodingBankTags } = await import('@/lib/coding/coding-bank-store');
  await ensureCodingBankTags();
  await prisma.questionTag.upsert({
    where: { slug: 'technical-java' },
    create: { slug: 'technical-java', name: 'Java Programming' },
    update: { name: 'Java Programming' },
  });

  const [tags, linkCounts, totalQuestions, uncategorizedCount] = await Promise.all([
    prisma.questionTag.findMany({ orderBy: { name: 'asc' } }),
    loadTagLinkCountsPrisma(),
    prisma.question.count(),
    loadAllTaggedQuestionIdsPrisma().then((ids) => countUncategorizedQuestionsPrisma(ids)),
  ]);

  const topics: QuestionBankTopicSummary[] = tags
    .filter((row) => row.slug)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name || row.slug,
      question_count: linkCounts.get(row.id) ?? 0,
    }));

  const sectionMap = new Map<QuestionBankSectionKey, QuestionBankTopicSummary[]>();
  const ensure = (key: QuestionBankSectionKey) => {
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    return sectionMap.get(key)!;
  };

  for (const topic of topics) {
    ensure(sectionKeyForTopicSlug(topic.slug)).push(topic);
  }

  if (uncategorizedCount > 0) {
    ensure('uncategorized').push({
      id: 'uncategorized',
      slug: 'uncategorized',
      name: 'No topic tag',
      question_count: uncategorizedCount,
    });
  }

  const sectionOrder: QuestionBankSectionKey[] = [
    'aptitude',
    'logical',
    'technical',
    'coding',
    'verbal',
    'rmset',
    'other',
    'uncategorized',
  ];

  const sections: QuestionBankSectionSummary[] = sectionOrder
    .filter((key) => (sectionMap.get(key)?.length ?? 0) > 0)
    .map((key) => {
      const list = [...(sectionMap.get(key) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      return {
        key,
        name: QUESTION_BANK_SECTION_LABELS[key],
        topics: list,
        question_count: list.reduce((sum, t) => sum + t.question_count, 0),
      };
    });

  return {
    total_questions: totalQuestions,
    total_topics: topics.length,
    sections,
  };
}

export async function loadQuestionsForTopicPrisma(
  topicSlug: string,
  options?: { offset?: number; limit?: number },
): Promise<{ topic: ResolvedSyllabusTopic | null; total: number; questions: QuestionBankRow[] }> {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(Math.max(1, options?.limit ?? 200), 500);

  let topic: ResolvedSyllabusTopic | null = null;
  let allIds: string[] = [];

  if (topicSlug === 'uncategorized') {
    topic = { id: 'uncategorized', slug: 'uncategorized', name: 'No topic tag' };
    const tagged = await loadAllTaggedQuestionIdsPrisma();
    const all = await prisma.question.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    allIds = all.map((q) => q.id).filter((id) => !tagged.has(id));
  } else {
    const tagRow = await prisma.questionTag.findUnique({ where: { slug: topicSlug } });
    if (!tagRow) {
      return { topic: null, total: 0, questions: [] };
    }
    topic = { id: tagRow.id, slug: tagRow.slug, name: tagRow.name || topicSlug };
    const links = await prisma.questionTagLink.findMany({
      where: { tagId: tagRow.id },
      select: { questionId: true },
      orderBy: { questionId: 'asc' },
    });
    allIds = links.map((l) => l.questionId);
  }

  const total = allIds.length;
  const pageIds = allIds.slice(offset, offset + limit);
  if (pageIds.length === 0) {
    return { topic, total, questions: [] };
  }

  const rows = await prisma.question.findMany({ where: { id: { in: pageIds } } });
  const byId = new Map(rows.map((r) => [normalizeQuestionId(r.id), r]));
  const questions: QuestionBankRow[] = [];
  for (const id of pageIds) {
    const row = byId.get(id);
    if (row) questions.push(rowToBankQuestion(row));
  }

  return { topic, total, questions };
}

export async function loadFullQuestionBankForExportPrisma(): Promise<QuestionBankExportRow[]> {
  const overview = await loadQuestionBankOverviewPrisma();
  const out: QuestionBankExportRow[] = [];

  for (const section of overview.sections) {
    for (const topic of section.topics) {
      let offset = 0;
      const pageSize = 500;
      for (;;) {
        const batch = await loadQuestionsForTopicPrisma(topic.slug, {
          offset,
          limit: pageSize,
        });
        for (const q of batch.questions) {
          out.push({
            ...q,
            section: section.name,
            topic: topic.name,
          });
        }
        offset += pageSize;
        if (offset >= batch.total || batch.questions.length < pageSize) break;
      }
    }
  }

  return out;
}
