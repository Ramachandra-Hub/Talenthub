import type { DbServiceClient } from '@/lib/db/get-db-service';
import { randomUUID } from 'crypto';
import { dbRowTimestamps } from '@/lib/db/row-timestamps';
import { ensureTestCategory } from '@/lib/tests/ensure-test-category';
import { insertTestRow } from '@/lib/tests/insert-test';

const POOL_TEST_TITLE = 'Question Bank Pool';
const POOL_CATEGORY_SLUG = 'question-bank-pool';

let cachedPoolTestId: string | number | null = null;

/**
 * Legacy schemas require questions.test_id NOT NULL. Returns a stable pool test id
 * (creates category + test if needed). Works with UUID or BIGINT ids.
 */
export async function ensureQuestionBankPoolTestId(
  admin: DbServiceClient,
): Promise<string | number | null> {
  if (cachedPoolTestId != null) return cachedPoolTestId;

  const { data: byTitle } = await admin
    .from('tests')
    .select('id')
    .eq('title', POOL_TEST_TITLE)
    .limit(1)
    .maybeSingle();

  if (byTitle?.id != null) {
    cachedPoolTestId = byTitle.id as string | number;
    return cachedPoolTestId;
  }

  let categoryId: string | number | null = null;

  const { data: catBySlug } = await admin
    .from('test_categories')
    .select('id')
    .eq('slug', POOL_CATEGORY_SLUG)
    .maybeSingle();

  if (catBySlug?.id != null) {
    categoryId = catBySlug.id as string | number;
  } else {
    const { data: anyCat } = await admin.from('test_categories').select('id').limit(1).maybeSingle();
    if (anyCat?.id != null) categoryId = anyCat.id as string | number;
    else {
      try {
        categoryId = await ensureTestCategory(admin, {
          slug: POOL_CATEGORY_SLUG,
          name: 'Question Bank',
          description: 'Pool category for syllabus-tagged bank MCQs',
          icon: '📚',
        });
      } catch {
        return null;
      }
    }
  }

  try {
    const { rawId } = await insertTestRow(admin, {
      categoryId: categoryId as string | number,
      title: POOL_TEST_TITLE,
      description: 'Shared pool for draw-from-bank MCQs; not a student-facing exam.',
      durationMinutes: 60,
      totalQuestions: 0,
    });
    cachedPoolTestId = rawId;
    return cachedPoolTestId;
  } catch {
    // fall through to legacy minimal attempts
  }

  const poolId = randomUUID();
  const ts = dbRowTimestamps();
  const attempts: Record<string, unknown>[] = [
    {
      id: poolId,
      title: POOL_TEST_TITLE,
      description: 'Shared pool for draw-from-bank MCQs; not a student-facing exam.',
      total_questions: 0,
      duration_minutes: 60,
      category_id: categoryId,
      ...ts,
    },
    {
      id: randomUUID(),
      title: POOL_TEST_TITLE,
      description: 'Shared pool for draw-from-bank MCQs.',
      category_id: categoryId,
      ...dbRowTimestamps(),
    },
    {
      id: randomUUID(),
      title: POOL_TEST_TITLE,
      category_id: categoryId,
      ...dbRowTimestamps(),
    },
  ];

  for (const testRow of attempts) {
    const { data: newTest, error: testErr } = await admin
      .from('tests')
      .insert(testRow)
      .select('id')
      .single();

    if (!testErr && newTest?.id != null) {
      cachedPoolTestId = newTest.id as string | number;
      return cachedPoolTestId;
    }
  }

  const { data: retry } = await admin
    .from('tests')
    .select('id')
    .eq('title', POOL_TEST_TITLE)
    .maybeSingle();

  if (retry?.id != null) {
    cachedPoolTestId = retry.id as string | number;
    return cachedPoolTestId;
  }

  return null;
}

/** Attach pool test_id to bank question rows (required on legacy schemas). */
export async function attachPoolTestIdToRows(
  admin: DbServiceClient,
  rows: Record<string, unknown>[],
): Promise<{ rows: Record<string, unknown>[]; poolTestId: string | number | null }> {
  const poolTestId = await ensureQuestionBankPoolTestId(admin);
  if (poolTestId == null) return { rows, poolTestId: null };
  return {
    poolTestId,
    rows: rows.map((r) => ({ ...r, test_id: poolTestId })),
  };
}
