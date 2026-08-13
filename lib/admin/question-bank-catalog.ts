import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  questionIdsForTag,
  type ResolvedSyllabusTopic,
} from '@/lib/exam-builder/draw-questions';
import {
  RMSET_CORE_UNITS,
  SYLLABUS_GROUPS,
  type SyllabusGroupKey,
  type SyllabusUnit,
} from '@/lib/exam-builder/syllabus';
import { looksLikeUuid, normalizeQuestionId } from '@/lib/exam-builder/id-utils';

const QUESTION_PAGE = 200;

export type QuestionBankSectionKey = SyllabusGroupKey | 'coding' | 'other' | 'uncategorized';

export const QUESTION_BANK_SECTION_LABELS: Record<QuestionBankSectionKey, string> = {
  aptitude: 'Aptitude',
  logical: 'Logical reasoning',
  technical: 'Technical / CS',
  verbal: 'Verbal & English',
  rmset: 'RMSET & eligibility',
  ai: 'Artificial Intelligence',
  ml: 'Machine Learning',
  coding: 'Coding (C / Python)',
  other: 'Other topics',
  uncategorized: 'Uncategorized',
};

export type QuestionBankTopicSummary = {
  id: string;
  slug: string;
  name: string;
  question_count: number;
};

export type QuestionBankSectionSummary = {
  key: QuestionBankSectionKey;
  name: string;
  topics: QuestionBankTopicSummary[];
  question_count: number;
};

export type QuestionBankOverview = {
  total_questions: number;
  total_topics: number;
  sections: QuestionBankSectionSummary[];
};

export type QuestionBankRow = {
  id: string;
  question_text: string;
  difficulty: string;
  type: string;
  correct_answer: string;
  explanation: string | null;
  options: string[] | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  tags: string[] | null;
  category_id: string | null;
  created_at: string | null;
};

export type QuestionBankExportRow = QuestionBankRow & {
  section: string;
  topic: string;
};

function escapeCsv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function optionsForRow(q: QuestionBankRow): {
  a: string;
  b: string;
  c: string;
  d: string;
} {
  return {
    a: q.option_a ?? q.options?.[0] ?? '',
    b: q.option_b ?? q.options?.[1] ?? '',
    c: q.option_c ?? q.options?.[2] ?? '',
    d: q.option_d ?? q.options?.[3] ?? '',
  };
}

/** CSV document: full question text, all options, correct answer, explanation. */
export function buildQuestionBankCsv(rows: QuestionBankExportRow[]): string {
  const lines: string[] = [];
  lines.push(
    'Section,Topic,Question ID,Question,Option A,Option B,Option C,Option D,Correct Answer,Difficulty,Type,Explanation,Tags,Created At',
  );
  for (const q of rows) {
    const { a, b, c, d } = optionsForRow(q);
    lines.push(
      [
        escapeCsv(q.section),
        escapeCsv(q.topic),
        escapeCsv(q.id),
        escapeCsv(q.question_text),
        escapeCsv(a),
        escapeCsv(b),
        escapeCsv(c),
        escapeCsv(d),
        escapeCsv(q.correct_answer),
        escapeCsv(q.difficulty),
        escapeCsv(q.type),
        escapeCsv(q.explanation ?? ''),
        escapeCsv((q.tags ?? []).join('|')),
        escapeCsv(q.created_at ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

const slugToSection = (() => {
  const map = new Map<string, QuestionBankSectionKey>();
  for (const key of Object.keys(SYLLABUS_GROUPS) as SyllabusGroupKey[]) {
    for (const unit of SYLLABUS_GROUPS[key]) {
      map.set(unit.slug, key);
    }
  }
  for (const unit of RMSET_CORE_UNITS) {
    if (!map.has(unit.slug)) map.set(unit.slug, 'rmset');
  }
  return map;
})();

export function sectionKeyForTopicSlug(slug: string): QuestionBankSectionKey {
  if (
    slug === 'coding-problems' ||
    slug === 'coding-c' ||
    slug === 'coding-python' ||
    slug.startsWith('coding-')
  ) {
    return 'coding';
  }
  return slugToSection.get(slug) ?? 'other';
}

/** One paginated scan of question_tag_links — O(links) not O(tags × questions). */
async function loadTagLinkCounts(admin: DbServiceClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await admin
      .from('question_tag_links')
      .select('tag_id')
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.tag_id == null) continue;
      const tagId = String(row.tag_id);
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return counts;
}

async function loadAllTaggedQuestionIds(admin: DbServiceClient): Promise<Set<string>> {
  const taggedIds = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await admin
      .from('question_tag_links')
      .select('question_id')
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.question_id != null) taggedIds.add(normalizeQuestionId(row.question_id));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return taggedIds;
}

async function countUncategorizedQuestions(
  admin: DbServiceClient,
  taggedIds: Set<string>,
): Promise<number> {
  let offset = 0;
  let uncategorized = 0;
  const pageSize = 1000;
  const maxPages = 80;

  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await admin
      .from('questions')
      .select('id, tags')
      .range(offset, offset + pageSize - 1);
    if (error) break;
    const rows = data ?? [];
    for (const row of rows) {
      const id = normalizeQuestionId(row.id);
      if (taggedIds.has(id)) continue;
      const tags = row.tags as string[] | null;
      if (Array.isArray(tags) && tags.length > 0) continue;
      uncategorized += 1;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return uncategorized;
}

async function questionIdsLinkedToTag(admin: DbServiceClient, tagId: string): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await admin
      .from('question_tag_links')
      .select('question_id')
      .eq('tag_id', tagId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.question_id != null) ids.push(normalizeQuestionId(row.question_id));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

export async function loadQuestionBankOverview(
  admin: DbServiceClient,
): Promise<QuestionBankOverview> {
  const taggedIdsPromise = loadAllTaggedQuestionIds(admin);
  const [{ data: tagRows, error: tagErr }, linkCounts, taggedIds, tableCountRes, uncategorizedCount] =
    await Promise.all([
      admin.from('question_tags').select('id, slug, name').order('name'),
      loadTagLinkCounts(admin),
      taggedIdsPromise,
      admin.from('questions').select('id', { count: 'exact', head: true }),
      taggedIdsPromise.then((ids) => countUncategorizedQuestions(admin, ids)),
    ]);

  if (tagErr) throw new Error(tagErr.message);

  const topics: QuestionBankTopicSummary[] = [];
  for (const row of tagRows ?? []) {
    const id = String(row.id);
    const slug = String(row.slug ?? '');
    const name = String(row.name ?? slug);
    if (!slug) continue;
    topics.push({
      id,
      slug,
      name,
      question_count: linkCounts.get(id) ?? 0,
    });
  }

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
      const list = [...(sectionMap.get(key) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return {
        key,
        name: QUESTION_BANK_SECTION_LABELS[key],
        topics: list,
        question_count: list.reduce((sum, t) => sum + t.question_count, 0),
      };
    });

  const tableTotal = tableCountRes.count;

  return {
    total_questions: tableTotal ?? sections.reduce((sum, s) => sum + s.question_count, 0),
    total_topics: topics.length,
    sections,
  };
}

function rowToBankQuestion(row: Record<string, unknown>): QuestionBankRow {
  const optionsRaw = row.options;
  let options: string[] | null = null;
  if (Array.isArray(optionsRaw)) {
    options = optionsRaw.map(String);
  }
  const tagsRaw = row.tags;
  let tags: string[] | null = null;
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map(String);
  }

  return {
    id: normalizeQuestionId(row.id),
    question_text: String(row.question_text ?? ''),
    difficulty: String(row.difficulty ?? 'medium'),
    type: String(row.type ?? row.question_type ?? 'MCQ'),
    correct_answer: String(row.correct_answer ?? ''),
    explanation: row.explanation != null ? String(row.explanation) : null,
    options,
    option_a: row.option_a != null ? String(row.option_a) : null,
    option_b: row.option_b != null ? String(row.option_b) : null,
    option_c: row.option_c != null ? String(row.option_c) : null,
    option_d: row.option_d != null ? String(row.option_d) : null,
    tags,
    category_id: row.category_id != null ? String(row.category_id) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
  };
}

async function loadUncategorizedQuestionIds(admin: DbServiceClient): Promise<string[]> {
  const taggedIds = await loadAllTaggedQuestionIds(admin);

  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from('questions')
      .select('id, tags')
      .order('created_at', { ascending: false })
      .range(offset, offset + 900 - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const id = normalizeQuestionId(row.id);
      if (taggedIds.has(id)) continue;
      const tags = row.tags as string[] | null;
      if (Array.isArray(tags) && tags.length > 0) continue;
      out.push(id);
    }
    if (rows.length < 900) break;
    offset += 900;
  }
  return out;
}

export async function loadQuestionsForTopic(
  admin: DbServiceClient,
  topicSlug: string,
  options?: { offset?: number; limit?: number },
): Promise<{ topic: ResolvedSyllabusTopic | null; total: number; questions: QuestionBankRow[] }> {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(Math.max(1, options?.limit ?? QUESTION_PAGE), 500);

  let topic: ResolvedSyllabusTopic | null = null;
  let allIds: string[] = [];

  if (topicSlug === 'uncategorized') {
    topic = { id: 'uncategorized', slug: 'uncategorized', name: 'No topic tag' };
    allIds = await loadUncategorizedQuestionIds(admin);
  } else {
    const { data: tagRow } = await admin
      .from('question_tags')
      .select('id, slug, name')
      .eq('slug', topicSlug)
      .maybeSingle();

    if (!tagRow?.id) {
      return { topic: null, total: 0, questions: [] };
    }

    topic = {
      id: String(tagRow.id),
      slug: String(tagRow.slug),
      name: String(tagRow.name ?? topicSlug),
    };
    allIds = await questionIdsLinkedToTag(admin, topic.id);
    if (allIds.length === 0) {
      allIds = await questionIdsForTag(admin, topic.id, topic.slug);
    }
  }

  const total = allIds.length;
  const pageIds = allIds.slice(offset, offset + limit);
  if (pageIds.length === 0) {
    return { topic, total, questions: [] };
  }

  const { data: rows, error } = await admin.from('questions').select('*').in('id', pageIds);
  if (error) throw new Error(error.message);

  const byId = new Map((rows ?? []).map((r) => [normalizeQuestionId(r.id), r]));
  const questions: QuestionBankRow[] = [];
  for (const id of pageIds) {
    const row = byId.get(id);
    if (row) questions.push(rowToBankQuestion(row as Record<string, unknown>));
  }

  return { topic, total, questions };
}

type TagMeta = { slug: string; name: string; section: QuestionBankSectionKey };

async function loadQuestionTopicMap(admin: DbServiceClient): Promise<Map<string, TagMeta[]>> {
  const { data: tagRows, error: tagErr } = await admin
    .from('question_tags')
    .select('id, slug, name');
  if (tagErr) throw new Error(tagErr.message);

  const tagById = new Map<string, TagMeta>();
  for (const row of tagRows ?? []) {
    const slug = String(row.slug ?? '');
    if (!slug) continue;
    tagById.set(String(row.id), {
      slug,
      name: String(row.name ?? slug),
      section: sectionKeyForTopicSlug(slug),
    });
  }

  const byQuestion = new Map<string, TagMeta[]>();
  let linkOffset = 0;
  for (;;) {
    const { data: links, error: linkErr } = await admin
      .from('question_tag_links')
      .select('question_id, tag_id')
      .range(linkOffset, linkOffset + 900 - 1);
    if (linkErr) throw new Error(linkErr.message);
    const rows = links ?? [];
    for (const link of rows) {
      if (link.question_id == null || link.tag_id == null) continue;
      const qid = normalizeQuestionId(link.question_id);
      const meta = tagById.get(String(link.tag_id));
      if (!meta) continue;
      const list = byQuestion.get(qid) ?? [];
      if (!list.some((t) => t.slug === meta.slug)) list.push(meta);
      byQuestion.set(qid, list);
    }
    if (rows.length < 900) break;
    linkOffset += 900;
  }

  return byQuestion;
}

/** Every question in the bank once, with section/topic labels for export. */
export async function loadFullQuestionBankForExport(
  admin: DbServiceClient,
): Promise<QuestionBankExportRow[]> {
  const topicsByQuestion = await loadQuestionTopicMap(admin);
  const exportRows: QuestionBankExportRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from('questions')
      .select('*')
      .order('created_at', { ascending: true })
      .range(offset, offset + 500 - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const raw of rows) {
      const q = rowToBankQuestion(raw as Record<string, unknown>);
      const linked = topicsByQuestion.get(q.id) ?? [];
      const slugTags = Array.isArray(q.tags)
        ? q.tags.filter((t) => typeof t === 'string' && t.length > 0)
        : [];

      if (linked.length > 0) {
        const sections = [...new Set(linked.map((t) => QUESTION_BANK_SECTION_LABELS[t.section]))];
        exportRows.push({
          ...q,
          section: sections.length === 1 ? sections[0]! : sections.join('; '),
          topic: linked.map((t) => t.name).join('; '),
        });
      } else if (slugTags.length > 0) {
        const metas = slugTags.map((slug) => ({
          slug,
          name: slug,
          section: sectionKeyForTopicSlug(slug),
        }));
        const sections = [...new Set(metas.map((t) => QUESTION_BANK_SECTION_LABELS[t.section]))];
        exportRows.push({
          ...q,
          section: sections.length === 1 ? sections[0]! : sections.join('; '),
          topic: metas.map((t) => t.name).join('; '),
        });
      } else {
        exportRows.push({
          ...q,
          section: QUESTION_BANK_SECTION_LABELS.uncategorized,
          topic: 'No topic tag',
        });
      }
    }
    if (rows.length < 500) break;
    offset += 500;
  }

  return exportRows;
}

/** All syllabus units grouped by section (static catalog for exam builder). */
export function staticSyllabusSections(): Array<{
  key: SyllabusGroupKey;
  name: string;
  units: SyllabusUnit[];
}> {
  return (Object.keys(SYLLABUS_GROUPS) as SyllabusGroupKey[]).map((key) => ({
    key,
    name: QUESTION_BANK_SECTION_LABELS[key],
    units: [...SYLLABUS_GROUPS[key]],
  }));
}
