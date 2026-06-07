import type { DbServiceClient } from '@/lib/db/get-db-service';
import { linkTestQuestions } from '@/lib/exam-builder/link-test-questions';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';

const SYLLABUS_CATEGORY_SLUG = 'syllabus-exams';

async function ensureCategory(admin: DbServiceClient): Promise<string> {
  const { data: existing } = await admin
    .from('test_categories')
    .select('id')
    .eq('slug', SYLLABUS_CATEGORY_SLUG)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await admin
    .from('test_categories')
    .insert({
      name: 'Syllabus Exams',
      slug: SYLLABUS_CATEGORY_SLUG,
      description: 'Faculty and admin syllabus-based examinations',
      icon: '📋',
    })
    .select('id')
    .single();

  if (error || !created?.id) throw new Error(error?.message ?? 'Could not create category');
  return created.id as string;
}

export async function publishSyllabusExam(
  admin: DbServiceClient,
  input: {
    title: string;
    description?: string;
    durationMinutes: number;
    questions: FacultyExamQuestion[];
    testType: string;
  },
): Promise<{ testId: string }> {
  if (!input.questions.length) throw new Error('No questions to publish');

  const categoryId = await ensureCategory(admin);

  const { data: testRow, error: testError } = await admin
    .from('tests')
    .insert({
      category_id: categoryId,
      title: input.title,
      description: input.description ?? `${input.testType} syllabus exam`,
      duration_minutes: input.durationMinutes,
      total_questions: input.questions.length,
      difficulty: 'medium',
    })
    .select('id')
    .single();

  if (testError || !testRow?.id) throw new Error(testError?.message ?? 'Failed to create test');

  const testId = testRow.id as string;

  const mcqQuestions = input.questions.filter(
    (q): q is import('@/lib/faculty-exams').FacultyMcqQuestion =>
      (q as { question_type?: string }).question_type !== 'coding',
  );

  const questionRows = mcqQuestions.map((q) => ({
    test_id: testId,
    question_text: q.question_text,
    question_type: 'mcq',
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    correct_answer: q.correct_answer,
    explanation: q.explanation ?? '',
    marks: 1,
    tags: [input.testType],
  }));

  const { data: inserted, error: qError } = await admin
    .from('questions')
    .insert(questionRows)
    .select('id');

  if (qError) throw new Error(qError.message);

  if (inserted?.length) {
    await linkTestQuestions(admin, testId, inserted as Array<{ id: unknown }>);
  }

  return { testId };
}
