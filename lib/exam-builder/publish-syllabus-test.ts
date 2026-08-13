import type { DbServiceClient } from '@/lib/db/get-db-service';
import { randomUUID } from 'crypto';
import { dbRowTimestamps } from '@/lib/db/row-timestamps';
import { linkTestQuestions } from '@/lib/exam-builder/link-test-questions';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { ensureTestCategory } from '@/lib/tests/ensure-test-category';
import { insertTestRow } from '@/lib/tests/insert-test';

const SYLLABUS_CATEGORY_SLUG = 'syllabus-exams';

async function ensureCategory(admin: DbServiceClient): Promise<string> {
  return ensureTestCategory(admin, {
    slug: SYLLABUS_CATEGORY_SLUG,
    name: 'Syllabus Exams',
    description: 'Faculty and admin syllabus-based examinations',
    icon: '📋',
  });
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

  const { testId } = await insertTestRow(admin, {
    categoryId,
    title: input.title,
    description: input.description ?? `${input.testType} syllabus exam`,
    durationMinutes: input.durationMinutes,
    totalQuestions: input.questions.length,
    difficulty: 'medium',
  });

  const mcqQuestions = input.questions.filter(
    (q): q is import('@/lib/faculty-exams').FacultyMcqQuestion =>
      (q as { question_type?: string }).question_type !== 'coding',
  );

  const questionRows = mcqQuestions.map((q) => ({
    id: randomUUID(),
    ...dbRowTimestamps(),
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
