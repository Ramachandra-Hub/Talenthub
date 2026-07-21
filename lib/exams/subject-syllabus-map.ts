import { slugifySubjectName } from '@/lib/exams/exam-builder-service';

/** Maps Exam Builder Pro subject slugs to question-bank syllabus tag slugs. */
const SUBJECT_SLUG_TO_TOPIC: Record<string, string> = {
  aptitude: 'aptitude-percentages',
  'logical-reasoning': 'logical-reasoning',
  'verbal-ability': 'verbal-ability',
  'c-programming': 'technical-c-language',
  c: 'technical-c-language',
  'c-language': 'technical-c-language',
  java: 'technical-programming',
  python: 'technical-programming',
  javascript: 'technical-programming',
  typescript: 'technical-programming',
  sql: 'technical-dbms',
  dbms: 'dbms',
  'data-structures': 'dsa',
  'operating-systems': 'operating-systems',
  'computer-networks': 'technical-networks',
  'web-development': 'technical-programming',
  ai: 'computer-science',
  'machine-learning': 'computer-science',
};

export function syllabusTopicSlugForSubject(input: {
  slug: string;
  subjectName: string;
}): string {
  const slug = input.slug.trim().toLowerCase() || slugifySubjectName(input.subjectName);
  if (SUBJECT_SLUG_TO_TOPIC[slug]) return SUBJECT_SLUG_TO_TOPIC[slug];
  if (slug.includes('c-program') || slug === 'c') return 'technical-c-language';
  if (slug.includes('aptitude')) return 'aptitude-percentages';
  if (slug.includes('verbal')) return 'verbal-ability';
  if (slug.includes('logical')) return 'logical-reasoning';
  if (slug.includes('dbms') || slug.includes('sql')) return 'dbms';
  if (slug.includes('network')) return 'technical-networks';
  if (slug.includes('operating')) return 'operating-systems';
  if (slug.includes('data-structure') || slug === 'dsa') return 'dsa';
  return slug;
}

export function codingLanguageForSubjectSlug(slug: string): 'c' | 'python' {
  const s = slug.trim().toLowerCase();
  if (s.includes('python')) return 'python';
  return 'c';
}
