import type { DbServiceClient } from '@/lib/db/get-db-service';
import { isFacultyMcqQuestion, type FacultyExamQuestion } from '@/lib/faculty-exams';
import { CURATED_BANK_MARKER } from '@/lib/question-bank/curated-mcqs';

const PROBE_COLUMNS = [
  'question_text',
  'correct_answer',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'options',
  'explanation',
  'difficulty',
  'type',
  'question_type',
  'tags',
  'marks',
  'test_id',
  'category_id',
] as const;

export type QuestionsInsertShape = Set<(typeof PROBE_COLUMNS)[number]>;

/** Which public.questions columns PostgREST exposes (schema cache). */
export async function probeQuestionsInsertShape(admin: DbServiceClient): Promise<QuestionsInsertShape> {
  const shape = new Set<(typeof PROBE_COLUMNS)[number]>();
  await Promise.all(
    PROBE_COLUMNS.map(async (col) => {
      const { error } = await admin.from('questions').select(col).limit(0);
      if (!error) shape.add(col);
    }),
  );
  return shape;
}

export function hasBankMcqColumns(shape: QuestionsInsertShape): boolean {
  return (
    shape.has('question_text') &&
    shape.has('correct_answer') &&
    (shape.has('option_a') || shape.has('options'))
  );
}

export function mcqToQuestionRow(
  q: FacultyExamQuestion,
  shape: QuestionsInsertShape,
  extras: {
    tagSlug: string;
    tagId: string;
    poolTestId?: string | number | null;
    categoryId?: string | null;
  },
): Record<string, unknown> {
  if (!isFacultyMcqQuestion(q)) {
    throw new Error('mcqToQuestionRow expects an MCQ question');
  }
  const row: Record<string, unknown> = {
    question_text: q.question_text,
    correct_answer: q.correct_answer,
  };

  if (shape.has('option_a')) {
    row.option_a = q.option_a;
    row.option_b = q.option_b;
    row.option_c = q.option_c;
    row.option_d = q.option_d;
  } else if (shape.has('options')) {
    row.options = [q.option_a, q.option_b, q.option_c, q.option_d];
  }

  if (shape.has('explanation')) {
    row.explanation = q.explanation ?? `${CURATED_BANK_MARKER} · ${extras.tagSlug}`;
  }

  if (shape.has('difficulty')) row.difficulty = 'medium';
  if (shape.has('type')) row.type = 'MCQ';
  if (shape.has('question_type')) row.question_type = 'MCQ';
  if (shape.has('marks')) row.marks = 1;

  if (shape.has('tags')) {
    row.tags = [extras.tagSlug, extras.tagId, CURATED_BANK_MARKER];
  }

  if (extras.poolTestId != null && shape.has('test_id')) {
    row.test_id = extras.poolTestId;
  }

  if (extras.categoryId && shape.has('category_id')) {
    row.category_id = extras.categoryId;
  }

  return row;
}
