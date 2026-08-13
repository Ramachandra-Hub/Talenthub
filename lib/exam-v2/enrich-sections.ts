import type { Question } from '@/lib/types';
import type { TestSectionConfig } from '@/lib/exam-v2/section-timer';

function slugFromQuestionTags(question: Question): string | null {
  for (const tag of question.tags ?? []) {
    if (typeof tag === 'string' && tag.startsWith('pro-subject:')) {
      return tag.slice('pro-subject:'.length).trim() || null;
    }
  }
  return null;
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Attach questionCount to test sections using pro-subject tags on questions. */
export function enrichSectionsWithQuestionCounts(
  sections: TestSectionConfig[],
  questions: Question[],
): TestSectionConfig[] {
  if (!sections.length) return sections;

  const countBySlug = new Map<string, number>();
  for (const q of questions) {
    const slug = slugFromQuestionTags(q);
    if (!slug) continue;
    countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
  }

  return sections.map((section) => {
    const slug = slugifyName(section.name);
    const bySlug = countBySlug.get(slug);
    if (bySlug != null) return { ...section, questionCount: bySlug };
    const byName = countBySlug.get(section.name.trim().toLowerCase());
    if (byName != null) return { ...section, questionCount: byName };
    return section;
  });
}
