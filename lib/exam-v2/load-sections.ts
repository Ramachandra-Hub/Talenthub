import type { DbServiceClient } from '@/lib/db/get-db-service';
import { prisma } from '@/lib/prisma';
import type { Question } from '@/lib/types';
import type { TestSectionConfig } from '@/lib/exam-v2/section-timer';

export async function loadTestSectionsPrisma(testId: string): Promise<TestSectionConfig[]> {
  const rows = await prisma.testSection.findMany({
    where: { testId },
    orderBy: { sortOrder: 'asc' },
  });
  if (!rows.length) return [];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
    cutoffScore: row.cutoffScore,
    negativeMarking: Number(row.negativeMarking ?? 0),
    shuffleQuestions: row.shuffleQuestions,
  }));
}

export async function loadTestSections(
  db: DbServiceClient,
  testId: string,
): Promise<TestSectionConfig[]> {
  const { data, error } = await db
    .from('test_sections')
    .select('*')
    .eq('test_id', testId)
    .order('sort_order', { ascending: true });

  if (error || !data?.length) return [];

  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    durationMinutes: row.duration_minutes as number,
    cutoffScore: (row.cutoff_score as number | null) ?? null,
    negativeMarking: Number(row.negative_marking ?? 0),
    shuffleQuestions: Boolean(row.shuffle_questions),
  }));
}

export function assignQuestionsToSections(
  questions: Question[],
  sections: TestSectionConfig[],
): Map<string, Question[]> {
  const map = new Map<string, Question[]>();
  if (!sections.length) return map;

  const hasExplicitCounts = sections.every(
    (s) => typeof s.questionCount === 'number' && s.questionCount >= 0,
  );

  if (hasExplicitCounts) {
    let offset = 0;
    for (const section of sections) {
      const count = section.questionCount ?? 0;
      const slice = questions.slice(offset, offset + count);
      map.set(section.id, section.shuffleQuestions ? shuffle(slice) : slice);
      offset += count;
    }
    return map;
  }

  const per = Math.max(1, Math.ceil(questions.length / sections.length));
  let offset = 0;
  for (const section of sections) {
    const slice = questions.slice(offset, offset + per);
    map.set(section.id, section.shuffleQuestions ? shuffle(slice) : slice);
    offset += per;
  }
  return map;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
