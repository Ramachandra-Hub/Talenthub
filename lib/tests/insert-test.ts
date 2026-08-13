import { randomUUID } from 'crypto';
import type { DbServiceClient } from '@/lib/db/get-db-service';
import { dbRowTimestamps } from '@/lib/db/row-timestamps';
import { detectTestsIdKind, normalizeTestId } from '@/lib/exam-builder/id-utils';

export type InsertTestInput = {
  categoryId: string | number;
  title: string;
  description?: string;
  durationMinutes: number;
  totalQuestions: number;
  difficulty?: string;
};

function withTestInsertDefaults(row: Record<string, unknown>, id: string): Record<string, unknown> {
  return {
    ...row,
    id,
    ...dbRowTimestamps(),
  };
}

/** Insert into tests across legacy schemas (title vs name, optional columns). */
export async function insertTestRow(
  admin: DbServiceClient,
  input: InsertTestInput,
): Promise<{ testId: string; rawId: string | number }> {
  const id = randomUUID();
  const base: Record<string, unknown> = {
    category_id: input.categoryId,
    title: input.title.trim(),
    name: input.title.trim(),
    description: input.description?.trim() ?? null,
    duration_minutes: input.durationMinutes,
    duration: input.durationMinutes,
    total_questions: input.totalQuestions,
    difficulty: input.difficulty ?? 'medium',
    difficulty_level: input.difficulty ?? 'medium',
  };

  const attempts: Record<string, unknown>[] = [
    withTestInsertDefaults(base, id),
    withTestInsertDefaults(
      {
        category_id: input.categoryId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        duration_minutes: input.durationMinutes,
        total_questions: input.totalQuestions,
        difficulty: input.difficulty ?? 'medium',
      },
      id,
    ),
    withTestInsertDefaults(
      {
        category_id: input.categoryId,
        name: input.title.trim(),
        description: input.description?.trim() ?? null,
        duration_minutes: input.durationMinutes,
        total_questions: input.totalQuestions,
      },
      id,
    ),
    withTestInsertDefaults(
      {
        category_id: input.categoryId,
        title: input.title.trim(),
        total_questions: input.totalQuestions,
        duration_minutes: input.durationMinutes,
      },
      id,
    ),
  ];

  let lastError = 'Failed to create test';

  for (const row of attempts) {
    const { data, error } = await admin.from('tests').insert(row).select('id').single();
    if (!error && data?.id != null) {
      const kind = await detectTestsIdKind(admin);
      const rawId = normalizeTestId(data.id, kind);
      return { testId: String(rawId), rawId };
    }
    if (error?.message) lastError = error.message;
  }

  throw new Error(lastError);
}
