import type { DbServiceClient } from '@/lib/db/get-db-service';
import { randomUUID } from 'crypto';
import type { ProExamSubjectBlock } from '@/lib/exams/draw-questions-for-exam';

export type ProExamSectionPlan = {
  subjectName: string;
  subjectSlug: string;
  questionCount: number;
  shuffleQuestions: boolean;
};

export function sectionPlansFromBlocks(blocks: ProExamSubjectBlock[]): ProExamSectionPlan[] {
  return blocks.map((block) => ({
    subjectName: block.subjectName,
    subjectSlug: block.subjectSlug,
    questionCount: block.questionCount,
    shuffleQuestions: true,
  }));
}

/** Create one test_section per subject so students see per-subject progress. */
export async function createProExamTestSections(
  admin: DbServiceClient,
  input: {
    testId: string;
    examDurationMinutes: number;
    sections: ProExamSectionPlan[];
  },
): Promise<void> {
  if (!input.sections.length) return;

  const totalQuestions = input.sections.reduce((n, s) => n + s.questionCount, 0);
  const durationPerQuestion =
    totalQuestions > 0 ? Math.max(1, Math.floor(input.examDurationMinutes / totalQuestions)) : 1;

  const rows = input.sections.map((section, index) => ({
    id: randomUUID(),
    test_id: input.testId,
    name: section.subjectName,
    duration_minutes: Math.max(1, durationPerQuestion * section.questionCount),
    sort_order: index,
    shuffle_questions: section.shuffleQuestions,
    negative_marking: 0,
  }));

  const { error } = await admin.from('test_sections').insert(rows);
  if (error) {
    console.warn('[createProExamTestSections]', error.message);
  }
}
