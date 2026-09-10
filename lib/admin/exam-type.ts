import { isElevateXAttemptMeta } from '@/lib/placement/scorecard-payload';

/** Admin report buckets — one dashboard tab per major exam family. */
export type AdminExamType =
  | 'all'
  | 'elevatex'
  | 'rmset'
  | 'department'
  | 'competitive'
  | 'programming'
  | 'psychometric'
  | 'other';

export const ADMIN_EXAM_TYPES: AdminExamType[] = [
  'all',
  'elevatex',
  'rmset',
  'department',
  'competitive',
  'programming',
  'psychometric',
  'other',
];

export const ADMIN_EXAM_TYPE_META: Record<
  AdminExamType,
  { label: string; description: string }
> = {
  all: { label: 'All tests', description: 'Every submitted attempt across the portal' },
  elevatex: { label: 'ElevateX', description: 'Placement talent challenge (100 marks, 6 sections)' },
  rmset: { label: 'RMSET', description: 'RCE-RMSET eligibility and scholarship test' },
  department: { label: 'Department exams', description: 'Faculty-approved branch exams' },
  competitive: { label: 'Competitive paper', description: 'All India competitive MCQ paper' },
  programming: { label: 'Programming', description: 'Timed coding assessments' },
  psychometric: { label: 'Psychometric', description: 'Visual and pattern psychometric paper' },
  other: { label: 'Other / practice', description: 'Practice tests and uncategorized attempts' },
};

export function parseAdminExamType(value: string | null | undefined): AdminExamType {
  const v = String(value ?? '').trim().toLowerCase();
  if (ADMIN_EXAM_TYPES.includes(v as AdminExamType)) return v as AdminExamType;
  return 'all';
}

export function classifyExamAttempt(input: {
  test_id?: string | null;
  test_name?: string | null;
  category_slug?: string | null;
}): Exclude<AdminExamType, 'all'> {
  const testId = String(input.test_id ?? '');
  const testName = String(input.test_name ?? '');
  const slug = String(input.category_slug ?? '').toLowerCase();

  if (isElevateXAttemptMeta(testId, testName)) return 'elevatex';

  if (slug === 'rmset' || /\brmset\b/i.test(testName)) return 'rmset';
  if (slug === 'psychometric' || /\bpsychometric\b/i.test(testName)) return 'psychometric';

  if (
    testName.startsWith('Department ·') ||
    testName.startsWith('Department ') ||
    slug === 'department-exams' ||
    slug === 'department'
  ) {
    return 'department';
  }

  if (
    testId.startsWith('dsa_hard_open:') ||
    testId === 'programming-assessment-v1' ||
    slug === 'programming' ||
    /\bprogramming\b/i.test(testName) ||
    /\bhard coding\b/i.test(testName) ||
    /\bcoding open link\b/i.test(testName)
  ) {
    return 'programming';
  }

  if (
    testId === 'fallback-competitive' ||
    slug === 'competitive' ||
    /\bcompetitive\b/i.test(testName)
  ) {
    return 'competitive';
  }

  return 'other';
}

export function matchesAdminExamType(
  examType: AdminExamType,
  input: {
    test_id?: string | null;
    test_name?: string | null;
    category_slug?: string | null;
  },
): boolean {
  if (examType === 'all') return true;
  return classifyExamAttempt(input) === examType;
}
