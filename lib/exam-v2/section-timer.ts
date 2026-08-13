export interface TestSectionConfig {
  id: string;
  name: string;
  durationMinutes: number;
  cutoffScore?: number | null;
  negativeMarking?: number;
  shuffleQuestions?: boolean;
  /** When set, assignQuestionsToSections uses explicit counts instead of even split. */
  questionCount?: number;
}

export function sectionDurationSeconds(section: TestSectionConfig): number {
  return section.durationMinutes * 60;
}

export function computeSectionProgress(
  sections: TestSectionConfig[],
  currentSectionIndex: number,
  sectionTimeRemainingSec: number,
): { label: string; percent: number } {
  if (!sections.length) return { label: 'Exam', percent: 0 };
  const current = sections[currentSectionIndex];
  const totalSec = sections.reduce((s, x) => s + sectionDurationSeconds(x), 0);
  const elapsedBefore = sections
    .slice(0, currentSectionIndex)
    .reduce((s, x) => s + sectionDurationSeconds(x), 0);
  const currentElapsed = current ? sectionDurationSeconds(current) - sectionTimeRemainingSec : 0;
  const percent = totalSec > 0 ? Math.min(100, ((elapsedBefore + currentElapsed) / totalSec) * 100) : 0;
  return {
    label: current?.name ?? 'Section',
    percent,
  };
}
