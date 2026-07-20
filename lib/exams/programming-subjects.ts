export type AssessmentFormat = 'mcq' | 'coding' | 'both';

const PROGRAMMING_SLUGS = new Set([
  'c-programming',
  'c-language',
  'c',
  'java',
  'python',
  'javascript',
  'typescript',
  'cpp',
  'c-plus-plus',
  'csharp',
  'c-sharp',
  'go',
  'golang',
  'kotlin',
  'swift',
  'php',
  'ruby',
  'rust',
]);

const PROGRAMMING_NAME_PATTERN =
  /\b(c\+\+|c#|c language|c programming|java|python|javascript|typescript|golang|kotlin|swift|php|ruby|rust|coding)\b/i;

/** Subjects that support MCQ / coding / both assessment modes. */
export function isProgrammingLanguageSubject(input: {
  slug?: string | null;
  subject_name?: string | null;
  subjectName?: string | null;
}): boolean {
  const slug = String(input.slug ?? '')
    .trim()
    .toLowerCase();
  if (slug && PROGRAMMING_SLUGS.has(slug)) return true;
  const name = String(input.subject_name ?? input.subjectName ?? '').trim();
  if (!name) return false;
  if (/^c$/i.test(name)) return true;
  return PROGRAMMING_NAME_PATTERN.test(name);
}

export function normalizeAssessmentFormat(value: unknown): AssessmentFormat {
  const raw = String(value ?? 'mcq').trim().toLowerCase();
  if (raw === 'coding' || raw === 'both') return raw;
  return 'mcq';
}

export function assessmentFormatLabel(format: AssessmentFormat): string {
  switch (format) {
    case 'coding':
      return 'Coding';
    case 'both':
      return 'MCQ + Coding';
    default:
      return 'MCQ';
  }
}
