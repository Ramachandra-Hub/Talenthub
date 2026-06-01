import type { DbServiceClient } from '@/lib/db/get-db-service';
import {
  detectQuestionsIdKind,
  isUuidTypeMismatchError,
  normalizeQuestionId,
} from '@/lib/exam-builder/id-utils';

/** Link published questions to a test via test_questions (handles legacy BIGINT question ids). */
export async function linkTestQuestions(
  admin: DbServiceClient,
  testId: string | number,
  insertedRows: Array<{ id: unknown }>,
): Promise<void> {
  if (!insertedRows.length) return;

  const questionIdKind = await detectQuestionsIdKind(admin);
  const normalizedTestId =
    typeof testId === 'number'
      ? testId
      : /^\d+$/.test(String(testId).trim())
        ? Number(testId)
        : testId;

  const links = insertedRows.map((row, idx) => {
    const rawId = normalizeQuestionId(row.id);
    const question_id =
      questionIdKind === 'bigint' ? Number(rawId) : rawId;
    return {
      test_id: normalizedTestId,
      question_id,
      sort_order: idx + 1,
    };
  });

  const { error } = await admin.from('test_questions').upsert(links, {
    onConflict: 'test_id,question_id',
  });

  if (!error) return;

  if (isUuidTypeMismatchError(String(error.message ?? ''))) {
    // Legacy schema mismatch — questions.test_id already links rows to the test.
    return;
  }

  // Non-fatal: approval should still complete; take-test page falls back to questions.test_id.
  console.warn('test_questions link skipped:', error.message);
}
