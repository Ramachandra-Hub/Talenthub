import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import {
  detectQuestionsIdKind,
  looksLikeBigIntId,
  looksLikeUuid,
  normalizeQuestionId,
} from '@/lib/exam-builder/id-utils';
import { ensureSyllabusBankForSlugs } from '@/lib/question-bank/seed-curated-bank-prisma';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function looksLikeUuidLocal(s: string): boolean {
  return looksLikeUuid(s);
}

async function upsertQuestionTag(
  admin: DbServiceClient,
  slug: string,
  name: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const { data: existing } = await admin
    .from('question_tags')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (existing?.id && looksLikeUuidLocal(String(existing.id))) {
    return {
      id: String(existing.id),
      slug: existing.slug as string,
      name: existing.name as string,
    };
  }

  const { data: inserted, error } = await admin
    .from('question_tags')
    .insert({ name, slug })
    .select('id, slug, name')
    .single();

  if (error) {
    const { data: again } = await admin
      .from('question_tags')
      .select('id, slug, name')
      .eq('slug', slug)
      .maybeSingle();
    if (again?.id) {
      return {
        id: String(again.id),
        slug: again.slug as string,
        name: again.name as string,
      };
    }
    return null;
  }

  return inserted
    ? { id: String(inserted.id), slug: inserted.slug as string, name: inserted.name as string }
    : null;
}

/** PostgREST often caps page size (~1k rows); accumulate pages for large banks. */
const QUESTION_FETCH_PAGE = 900;

async function getExcludedQuestionIds(
  admin: DbServiceClient,
  testType: string,
  slotKey: string,
): Promise<Set<string>> {
  const { data: priorDraws } = await admin
    .from('exam_builder_draws')
    .select('question_ids')
    .eq('test_type', testType)
    .eq('slot_key', slotKey)
    .order('created_at', { ascending: false })
    .limit(250);

  const excluded = new Set<string>();
  for (const row of priorDraws ?? []) {
    for (const id of (row.question_ids ?? []) as unknown[]) {
      excluded.add(normalizeQuestionId(id));
    }
  }
  return excluded;
}

export async function questionIdsMatchingTagSlug(
  admin: DbServiceClient,
  tagSlug: string,
): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .contains('tags', [tagSlug])
      .range(offset, offset + QUESTION_FETCH_PAGE - 1);
    if (error) {
      // JSONB contains may fail on older schemas — link table is primary path
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (row.id != null) out.push(normalizeQuestionId(row.id));
    }
    if (rows.length < QUESTION_FETCH_PAGE) break;
    offset += QUESTION_FETCH_PAGE;
  }
  return out;
}

export async function questionIdsForTag(
  admin: DbServiceClient,
  tagId: string,
  tagSlug: string,
): Promise<string[]> {
  const ids = new Set<string>();

  if (looksLikeUuidLocal(tagId)) {
    let linkOffset = 0;
    for (;;) {
      const { data: links, error } = await admin
        .from('question_tag_links')
        .select('question_id')
        .eq('tag_id', tagId)
        .range(linkOffset, linkOffset + QUESTION_FETCH_PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = links ?? [];
      for (const row of rows) {
        if (row.question_id != null) ids.add(normalizeQuestionId(row.question_id));
      }
      if (rows.length < QUESTION_FETCH_PAGE) break;
      linkOffset += QUESTION_FETCH_PAGE;
    }
  }

  for (const id of await questionIdsMatchingTagSlug(admin, tagSlug)) {
    ids.add(id);
  }

  return [...ids];
}

function rowToFacultyQuestion(row: Record<string, unknown>): FacultyExamQuestion | null {
  const text = String(row.question_text ?? '').trim();
  if (!text) return null;
  const letter = String(row.correct_answer ?? 'A').toUpperCase();
  const correct = ['A', 'B', 'C', 'D'].includes(letter) ? (letter as 'A' | 'B' | 'C' | 'D') : 'A';
  return {
    question_text: text,
    option_a: String(row.option_a ?? '').trim(),
    option_b: String(row.option_b ?? '').trim(),
    option_c: String(row.option_c ?? '').trim(),
    option_d: String(row.option_d ?? '').trim(),
    correct_answer: correct,
    explanation: row.explanation ? String(row.explanation) : undefined,
  };
}

export type ResolvedSyllabusTopic = { id: string; name: string; slug: string };

/** Resolve picker topic ids (UUID or slug) to tag rows for prompts and bank draws. */
export async function resolveSyllabusTopicsForBuilder(
  admin: DbServiceClient,
  topicIds: string[],
): Promise<ResolvedSyllabusTopic[]> {
  if (!topicIds.length) {
    throw new Error('Select at least one syllabus topic');
  }

  const { data: allTags } = await admin.from('question_tags').select('id, name, slug');

  const resolvedTags: ResolvedSyllabusTopic[] = [];
  for (const topicId of topicIds) {
    const raw = String(topicId).trim();
    if (!raw) continue;

    if (looksLikeBigIntId(raw)) {
      throw new Error(
        `Invalid syllabus topic id "${raw}" (looks like a question number). Re-select topics using "Select syllabus topics".`,
      );
    }

    const byId = (allTags ?? []).find((t) => String(t.id) === raw);
    if (byId && looksLikeUuidLocal(String(byId.id))) {
      resolvedTags.push({
        id: String(byId.id),
        name: byId.name as string,
        slug: byId.slug as string,
      });
      continue;
    }

    const bySlug = (allTags ?? []).find((t) => t.slug === raw);
    if (bySlug && looksLikeUuidLocal(String(bySlug.id))) {
      resolvedTags.push({
        id: String(bySlug.id),
        name: bySlug.name as string,
        slug: bySlug.slug as string,
      });
      continue;
    }

    if (looksLikeUuidLocal(raw)) {
      resolvedTags.push({ id: raw, name: raw, slug: raw });
      continue;
    }

    const ensured = await upsertQuestionTag(admin, raw, raw);
    if (ensured) {
      resolvedTags.push(ensured);
    }
  }

  if (!resolvedTags.length) {
    throw new Error('Selected syllabus topics not found');
  }

  return resolvedTags;
}

export type DrawExamQuestionsInput = {
  testType: string;
  topicIds: string[];
  questionsPerTopic: number;
  slotKey: string;
  createdBy: string;
};

export type DrawExamQuestionsResult = {
  questions: FacultyExamQuestion[];
  questionIds: string[];
  drawId: string;
  topicsUsed: { id: string; name: string; count: number }[];
  warnings: string[];
};

export async function drawExamQuestionsFromTopics(
  admin: DbServiceClient,
  input: DrawExamQuestionsInput,
): Promise<DrawExamQuestionsResult> {
  if (!input.topicIds.length) {
    throw new Error('Select at least one syllabus topic');
  }

  const excluded = await getExcludedQuestionIds(admin, input.testType, input.slotKey);
  const warnings: string[] = [];

  const resolvedTags = await resolveSyllabusTopicsForBuilder(admin, input.topicIds);

  const minBank = Math.max(input.questionsPerTopic + 10, 25);
  try {
    const seeded = await ensureSyllabusBankForSlugs(
      resolvedTags.map((t) => t.slug),
      minBank,
    );
    if (seeded.inserted > 0) {
      warnings.push(
        `Auto-loaded ${seeded.inserted} MCQ(s) for: ${seeded.slugs.join(', ')}.`,
      );
    }
  } catch {
    warnings.push(
      'Could not auto-fill an empty topic bank. Use Admin → Load topic question bank if draws still fail.',
    );
  }

  const usedInPaper = new Set<string>();
  const orderedIds: string[] = [];
  const topicsUsed: { id: string; name: string; count: number }[] = [];

  for (const tag of resolvedTags) {
    const fullForTag = await questionIdsForTag(admin, tag.id as string, tag.slug as string);
    let pool = shuffle(fullForTag).filter((id) => !excluded.has(id) && !usedInPaper.has(id));

    if (pool.length < input.questionsPerTopic && fullForTag.length > 0) {
      const recycled = shuffle(fullForTag).filter((id) => !usedInPaper.has(id));
      if (recycled.length > pool.length) {
        warnings.push(
          `"${tag.name}": slot "${input.slotKey}" had no unused draws left — reusing questions from the bank for this paper.`,
        );
        pool = recycled;
      }
    }

    if (pool.length < input.questionsPerTopic) {
      warnings.push(
        `"${tag.name}": only ${pool.length} question(s) available (requested ${input.questionsPerTopic}).`,
      );
    }

    const picked = pool.slice(0, input.questionsPerTopic);
    if (picked.length === 0) {
      if (fullForTag.length === 0) {
        throw new Error(
          `No questions in the bank for "${tag.name}" (slug: ${tag.slug}). Click "Load topic question bank" in Admin, or POST /api/exam-builder/seed-bank.`,
        );
      }
      throw new Error(
        `Could not pick questions for "${tag.name}". Try another slot or load more MCQs for this topic.`,
      );
    }

    topicsUsed.push({ id: tag.id as string, name: tag.name as string, count: picked.length });
    for (const id of picked) {
      usedInPaper.add(id);
      orderedIds.push(id);
    }
  }

  const { data: questionRows, error: fetchErr } = await admin
    .from('questions')
    .select('*')
    .in('id', orderedIds);

  if (fetchErr) {
    throw new Error(`Could not load drawn questions: ${fetchErr.message}`);
  }

  const byId = new Map((questionRows ?? []).map((r) => [normalizeQuestionId(r.id), r]));
  const questions: FacultyExamQuestion[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) continue;
    const q = rowToFacultyQuestion(row as Record<string, unknown>);
    if (q) questions.push(q);
  }

  if (orderedIds.length > 0 && questions.length === 0) {
    throw new Error(
      'Questions were selected from the bank but could not be loaded. Check DATABASE_URL / RDS schema (questions table).',
    );
  }

  const topicUuids = resolvedTags.map((t) => t.id).filter(looksLikeUuidLocal);
  const questionIdKind = await detectQuestionsIdKind(admin);
  const questionIdsForDraw =
    questionIdKind === 'bigint'
      ? orderedIds.map((id) => Number(id))
      : orderedIds.filter(looksLikeUuidLocal);

  const drawPayload: Record<string, unknown> = {
    test_type: input.testType,
    slot_key: input.slotKey,
    topic_ids: topicUuids,
    created_by: input.createdBy,
    question_ids: questionIdsForDraw,
  };

  const { data: drawRow, error: drawError } = await admin
    .from('exam_builder_draws')
    .insert(drawPayload)
    .select('id')
    .single();

  if (drawError) {
    warnings.push(
      `Could not record draw history (${drawError.message}). Questions are still loaded — you can submit for approval.`,
    );
  }

  return {
    questions,
    questionIds: orderedIds,
    drawId: drawRow?.id ? String(drawRow.id) : '',
    topicsUsed,
    warnings,
  };
}
