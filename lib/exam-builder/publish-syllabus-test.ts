import type { DbServiceClient } from '@/lib/db/get-db-service';
import { examQuestionToDbRow } from '@/lib/exam-builder/exam-question-db-row';
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

  const questionRows = input.questions.map((q) =>
    examQuestionToDbRow(q, { testId, tags: [input.testType] }),
  );

  if (!questionRows.length) throw new Error('No questions to publish');

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
