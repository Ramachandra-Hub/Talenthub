import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  augmentExamQuestionsWithCoding,
  examShouldIncludeCodingQuestions,
  isFacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import { parseQuestionsJson, type FacultyExamQuestion } from '@/lib/faculty-exams';
import { adaptQuestionRow, adaptTestRow, extractJoinedQuestion, isCodingQuestion } from '@/lib/practice-mappers';
import type { Question, Test } from '@/lib/types';

function testIdVariants(testId: string): (string | number)[] {
  const out: (string | number)[] = [testId];
  if (/^\d+$/.test(testId.trim())) {
    const n = Number(testId);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function facultyQuestionsToUiQuestions(
  items: FacultyExamQuestion[],
  testId: string,
): Question[] {
  const now = new Date().toISOString();
  return items.map((q, index) => {
    const id = `${testId}-q${index + 1}`;
    if (isFacultyCodingQuestion(q)) {
      return {
        id,
        category_id: '',
        difficulty: 'medium' as const,
        question_text: q.question_text,
        type: 'coding' as const,
        options: null,
        correct_answer: '',
        explanation: null,
        tags: ['technical-programming'],
        created_at: now,
        updated_at: now,
        question_type: 'coding',
        coding_problem_id: q.coding_problem_id,
        coding_title: q.title ?? null,
        coding_sample_input: q.sample_input ?? null,
        coding_sample_output: q.sample_output ?? null,
        coding_input_format: q.input_format ?? null,
        coding_output_format: q.output_format ?? null,
        coding_hint: null,
        coding_starter_code: null,
        coding_default_language: q.default_language ?? null,
        coding_test_cases: q.test_cases ?? null,
      };
    }
    return {
      id,
      category_id: '',
      difficulty: 'medium' as const,
      question_text: q.question_text,
      type: 'MCQ' as const,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      correct_answer: q.correct_answer,
      explanation: q.explanation ?? null,
      tags: null,
      created_at: now,
      updated_at: now,
      question_type: 'mcq',
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
    };
  });
}

/** Insert coding items from the published exam JSON when the questions table only has MCQs. */
export function mergeMissingCodingQuestions(
  loaded: Question[],
  facultyItems: FacultyExamQuestion[],
  testId: string,
): Question[] {
  const codingItems = facultyItems.filter(isFacultyCodingQuestion);
  if (!codingItems.length) return loaded;
  if (loaded.some(isCodingQuestion)) return loaded;

  const codingUi = facultyQuestionsToUiQuestions(facultyItems, testId).filter(isCodingQuestion);
  if (!loaded.length) return codingUi;

  const mcqs = loaded.filter((q) => !isCodingQuestion(q));
  let mcqIndex = 0;
  let codingIndex = 0;
  const merged: Question[] = [];
  for (const item of facultyItems) {
    if (isFacultyCodingQuestion(item)) {
      if (codingIndex < codingUi.length) merged.push(codingUi[codingIndex++]);
    } else if (mcqIndex < mcqs.length) {
      merged.push(mcqs[mcqIndex++]);
    }
  }
  while (mcqIndex < mcqs.length) merged.push(mcqs[mcqIndex++]);
  while (codingIndex < codingUi.length) merged.push(codingUi[codingIndex++]);
  return merged;
}

async function attachFacultyCodingIfMissing(
  client: DbServiceClient,
  testId: string,
  loaded: Question[],
): Promise<Question[]> {
  if (!loaded.length || loaded.some(isCodingQuestion)) return loaded;
  for (const id of testIdVariants(testId)) {
    const { data: fer } = await client
      .from('faculty_exam_requests')
      .select('questions_json')
      .eq('published_test_id', String(id))
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();
    if (!fer?.questions_json) continue;
    return mergeMissingCodingQuestions(loaded, parseQuestionsJson(fer.questions_json), String(testId));
  }
  return loaded;
}

async function resolveSyllabusSlugs(
  client: DbServiceClient,
  topicIds: unknown,
): Promise<string[]> {
  if (!Array.isArray(topicIds) || !topicIds.length) return [];
  const slugs: string[] = [];
  for (const raw of topicIds) {
    const id = String(raw).trim();
    if (!id) continue;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      slugs.push(id);
      continue;
    }
    const { data } = await client.from('question_tags').select('slug').eq('id', id).maybeSingle();
    if (data?.slug) slugs.push(data.slug as string);
  }
  return slugs;
}

function facultyQuestionsForTake(
  rawJson: unknown,
  topicSlugs: string[],
  testType: string | null | undefined,
): FacultyExamQuestion[] {
  const parsed = parseQuestionsJson(rawJson);
  const hasCoding = parsed.some(isFacultyCodingQuestion);
  if (hasCoding || !examShouldIncludeCodingQuestions(testType, topicSlugs)) {
    return parsed;
  }
  return augmentExamQuestionsWithCoding(parsed, topicSlugs, testType);
}

/** Load a test row (legacy schemas: bigint id, title vs name, optional category embed). */
export async function loadTestRowForTake(
  client: DbServiceClient,
  testId: string,
): Promise<Test | null> {
  const selects = [
    '*, test_categories(slug)',
    'id, title, name, category_id, duration_minutes, duration, total_questions, description, difficulty, difficulty_level, passing_score, is_paid, created_at, updated_at, question_time_limit_sec, question_time_seconds',
    'id, title, category_id, duration_minutes, total_questions, description',
    'id, name, category_id, duration, total_questions, description',
    '*',
  ];

  for (const columns of selects) {
    for (const id of testIdVariants(testId)) {
      const { data, error } = await client.from('tests').select(columns).eq('id', id).maybeSingle();
      if (error) continue;
      if (!data) continue;

      const test = adaptTestRow(data as Record<string, unknown>);
      if (!test.category_slug && test.category_id) {
        const { data: cat } = await client
          .from('test_categories')
          .select('slug')
          .eq('id', test.category_id)
          .maybeSingle();
        if (cat?.slug) test.category_slug = cat.slug as string;
      }
      return test;
    }
  }

  for (const id of testIdVariants(testId)) {
    const { data: fer } = await client
      .from('faculty_exam_requests')
      .select('title, description, duration_minutes, questions_json, published_test_id')
      .eq('published_test_id', String(id))
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();

    if (!fer?.title) continue;

    const qs = parseQuestionsJson(fer.questions_json);
    const now = new Date().toISOString();
    return {
      id: String(testId),
      name: fer.title as string,
      category_id: '',
      duration: Number(fer.duration_minutes ?? 30),
      total_questions: qs.length,
      passing_score: null,
      description: (fer.description as string | null) ?? null,
      difficulty_level: 'medium',
      is_paid: false,
      created_at: now,
      updated_at: now,
      question_time_limit_sec: null,
      category_slug: 'department-exams',
    };
  }

  return null;
}

/** Load MCQs for a test (test_questions join, questions.test_id, or faculty JSON fallback). */
export async function loadQuestionsForTake(
  client: DbServiceClient,
  testId: string,
): Promise<Question[]> {
  const { dedupeQuestionsByStem } = await import('@/lib/questions/dedupe-questions');
  for (const id of testIdVariants(testId)) {
    const { data: directQs, error: directErr } = await client
      .from('questions')
      .select('*')
      .eq('test_id', id)
      .order('id', { ascending: true });

    if (!directErr && directQs?.length) {
      return attachFacultyCodingIfMissing(
        client,
        testId,
        dedupeQuestionsByStem(
          directQs.map((q) => adaptQuestionRow(q as Record<string, unknown>)),
        ),
      );
    }
  }

  for (const id of testIdVariants(testId)) {
    const { data: links, error: linkErr } = await client
      .from('test_questions')
      .select('question_id, order')
      .eq('test_id', id)
      .order('order', { ascending: true });

    if (linkErr || !links?.length) continue;

    const questionIds = links
      .map((l) => l.question_id)
      .filter((qid): qid is string | number => qid != null);

    if (!questionIds.length) continue;

    const { data: qs, error: qErr } = await client.from('questions').select('*').in('id', questionIds);
    if (qErr || !qs?.length) continue;

    const byId = new Map(qs.map((q) => [String((q as { id: unknown }).id), q]));
    const ordered: Question[] = [];
    for (const link of links) {
      const row = byId.get(String(link.question_id));
      if (row) ordered.push(adaptQuestionRow(row as Record<string, unknown>));
    }
    if (ordered.length) {
      return attachFacultyCodingIfMissing(client, testId, dedupeQuestionsByStem(ordered));
    }

    const { data: joined, error: joinErr } = await client
      .from('test_questions')
      .select('order, question:questions(*)')
      .eq('test_id', id)
      .order('order', { ascending: true });

    if (!joinErr && joined?.length) {
      const fromJoin = joined
        .map(extractJoinedQuestion)
        .filter((q): q is Record<string, unknown> => q != null)
        .map(adaptQuestionRow);
      if (fromJoin.length) {
        return attachFacultyCodingIfMissing(client, testId, dedupeQuestionsByStem(fromJoin));
      }
    }
  }

  for (const id of testIdVariants(testId)) {
    const publishedId = String(id);
    const { data: fer } = await client
      .from('faculty_exam_requests')
      .select('questions_json, test_type, syllabus_topic_ids')
      .eq('published_test_id', publishedId)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();

    if (fer?.questions_json) {
      const topicSlugs = await resolveSyllabusSlugs(client, fer.syllabus_topic_ids);
      const items = facultyQuestionsForTake(
        fer.questions_json,
        topicSlugs,
        (fer.test_type as string | null) ?? null,
      );
      if (items.length) {
        return dedupeQuestionsByStem(facultyQuestionsToUiQuestions(items, String(testId)));
      }
    }
  }

  return [];
}

export async function loadTestBundleForTake(
  client: DbServiceClient,
  testId: string,
): Promise<{ test: Test | null; questions: Question[] }> {
  const test = await loadTestRowForTake(client, testId);
  const questions = await loadQuestionsForTake(client, testId);
  return { test, questions };
}
