import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  detectQuestionsIdKind,
  looksLikeUuid,
  normalizeQuestionId,
} from '@/lib/exam-builder/id-utils';
import { linkTestQuestions } from '@/lib/exam-builder/link-test-questions';
import { resolveSyllabusTopicsForBuilder } from '@/lib/exam-builder/draw-questions';
import { RMSET_CATEGORY_SLUG } from '@/lib/rmset/types';
import { insertTestRow } from '@/lib/tests/insert-test';
import { ensureTestCategory } from '@/lib/tests/ensure-test-category';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function ensureRmsetCategory(admin: DbServiceClient): Promise<string> {
  return ensureTestCategory(admin, {
    slug: RMSET_CATEGORY_SLUG,
    name: 'RMSET',
    description: 'Topic-selected eligibility test',
    icon: '📋',
  });
}

async function questionIdsForTopic(
  admin: DbServiceClient,
  tagId: string,
  tagSlug: string,
): Promise<string[]> {
  const ids = new Set<string>();

  let resolvedTagId: string | null = looksLikeUuid(tagId) ? tagId : null;
  if (!resolvedTagId) {
    const { data: tagRow } = await admin
      .from('question_tags')
      .select('id')
      .eq('slug', tagSlug)
      .maybeSingle();
    if (tagRow?.id && looksLikeUuid(String(tagRow.id))) {
      resolvedTagId = String(tagRow.id);
    }
  }

  if (resolvedTagId) {
    const { data: links } = await admin
      .from('question_tag_links')
      .select('question_id')
      .eq('tag_id', resolvedTagId);
    for (const row of links ?? []) {
      if (row.question_id) ids.add(row.question_id as string);
    }
  }

  const { data: taggedRows } = await admin.from('questions').select('id, tags');

  for (const row of taggedRows ?? []) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    if (tags.some((t) => t === tagSlug || t === tagId)) {
      ids.add(row.id as string);
    }
  }

  return [...ids];
}

export type PublishRmsetInput = {
  title: string;
  description?: string;
  topicIds: string[];
  questionsPerTopic: number;
  durationMinutes: number;
  createdBy: string;
  paperId?: string;
};

export async function publishRmsetPaper(
  admin: DbServiceClient,
  input: PublishRmsetInput,
): Promise<{ paperId: string; testId: string; totalQuestions: number }> {
  if (!input.topicIds.length) {
    throw new Error('Select at least one topic');
  }

  const resolvedTags = await resolveSyllabusTopicsForBuilder(admin, input.topicIds);
  if (!resolvedTags.length) throw new Error('Selected topics not found');

  const used = new Set<string>();
  const orderedQuestionIds: string[] = [];

  for (const tag of resolvedTags) {
    const pool = shuffle(await questionIdsForTopic(admin, tag.id, tag.slug)).filter(
      (id) => !used.has(id),
    );
    const picked = pool.slice(0, input.questionsPerTopic);
    if (picked.length === 0) {
      throw new Error(`No questions found for topic "${tag.name}". Tag questions in the bank first.`);
    }
    for (const id of picked) {
      used.add(id);
      orderedQuestionIds.push(id);
    }
  }

  const categoryId = await ensureRmsetCategory(admin);
  const topicNames = resolvedTags.map((t) => t.name).join(', ');

  const { testId } = await insertTestRow(admin, {
    categoryId,
    title: input.title.trim(),
    description:
      input.description?.trim() ||
      `RMSET paper covering: ${topicNames}. ${orderedQuestionIds.length} MCQs.`,
    durationMinutes: input.durationMinutes,
    totalQuestions: orderedQuestionIds.length,
    difficulty: 'medium',
  });

  const idKind = await detectQuestionsIdKind(admin);
  await linkTestQuestions(
    admin,
    testId,
    orderedQuestionIds.map((id) => ({
      id: idKind === 'bigint' ? Number(normalizeQuestionId(id)) : normalizeQuestionId(id),
    })),
  );

  await admin
    .from('rmset_papers')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('status', 'published');

  const paperPayload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    test_id: testId,
    topic_ids: resolvedTags.map((t) => t.id),
    questions_per_topic: input.questionsPerTopic,
    duration_minutes: input.durationMinutes,
    status: 'published',
    created_by: input.createdBy,
    updated_at: new Date().toISOString(),
  };

  if (input.paperId) {
    const { data: updated, error: updateError } = await admin
      .from('rmset_papers')
      .update(paperPayload)
      .eq('id', input.paperId)
      .select('id')
      .single();
    if (updateError || !updated?.id) throw new Error(updateError?.message ?? 'Could not update paper');
    return { paperId: updated.id as string, testId, totalQuestions: orderedQuestionIds.length };
  }

  const { data: created, error: createError } = await admin
    .from('rmset_papers')
    .insert(paperPayload)
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? 'Could not save RMSET paper');
  }

  return { paperId: created.id as string, testId, totalQuestions: orderedQuestionIds.length };
}
