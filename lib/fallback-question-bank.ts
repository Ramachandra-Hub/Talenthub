import type { Question, Test, TestCategory } from '@/lib/types';
import { isStrictProduction } from '@/lib/production';

/** Client-side fallback papers are disabled in production — use DB-backed tests only. */
export function isFallbackTestsEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK_TESTS === 'true') return true;
  if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK_TESTS === 'false') return false;
  return !isStrictProduction();
}
import {
  hashStringToSeed,
  PSYCHOMETRIC_POOL_SIZE,
  psychometricQuestionFromIndex,
  sampleUniqueIndices,
} from '@/lib/psychometric-question-gen';

const now = new Date().toISOString();

/** Fallback psychometric: 30 min, 200 unique items sampled from ~128k pool */
export const PSYCHOMETRIC_FALLBACK_QUESTION_COUNT = 200;

/** sessionStorage — one randomized question set per test per browser tab session */
const PAPER_STORAGE_PREFIX = 'prepIndiaPsychPaper:v2:';

const categories: TestCategory[] = [
  {
    id: '1',
    name: 'Psychometric Prep',
    slug: 'psychometric',
    description:
      `Full paper: ${PSYCHOMETRIC_FALLBACK_QUESTION_COUNT} visual / pattern MCQs in 30 minutes. Each candidate gets a different draw from the same large pool.`,
    icon: '🧠',
    order: 1,
    created_at: now,
  },
];

const tests: Test[] = [
  {
    id: 'fallback-psychometric-1',
    name: 'Psychometric — full paper (patterns & visuals)',
    category_id: '1',
    duration: 30,
    total_questions: PSYCHOMETRIC_FALLBACK_QUESTION_COUNT,
    passing_score: null,
    description:
      '200 picture-style reasoning items—sequences, rotations, grids, parity, counting. Total time 30 minutes. Your 200 questions are drawn once per session from ~128 000 variants (no repeats within your paper); other candidates receive different mixes.',
    difficulty_level: 'medium',
    is_paid: false,
    created_at: now,
    updated_at: now,
  },
];

/** Stable UUID per psychometric sitting; avoids reshuffling mid-attempt on refresh */
export function ensurePsychometricPaperId(testId: string): string {
  const key = `${PAPER_STORAGE_PREFIX}${testId}`;
  if (typeof window === 'undefined') {
    return `ssr-placeholder-${testId}`;
  }
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Start a completely new randomly drawn deck (e.g. new candidate on same browser) */
export function resetPsychometricPaperSession(testId: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${PAPER_STORAGE_PREFIX}${testId}`);
}

export function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === 'PGRST205';
}

export function getFallbackCategoryBySlug(slug: string): TestCategory | null {
  if (!isFallbackTestsEnabled()) return null;
  return categories.find((c) => c.slug === slug) ?? null;
}

export function getFallbackTestsByCategorySlug(slug: string): Test[] {
  if (!isFallbackTestsEnabled()) return [];
  const category = getFallbackCategoryBySlug(slug);
  if (!category) return [];
  return tests.filter((t) => t.category_id === category.id);
}

export function getFallbackTestById(testId: string): Test | null {
  if (!isFallbackTestsEnabled()) return null;
  return tests.find((t) => t.id === testId) ?? null;
}

export function getFallbackQuestionsByTestId(testId: string): Question[] {
  if (!isFallbackTestsEnabled()) return [];
  if (testId !== 'fallback-psychometric-1') return [];
  return getPsychometricQuestionsForTestId(testId);
}

/** Generate psychometric paper for any test id (session-seeded, no repeats inside the paper). */
export function getPsychometricQuestionsForTestId(testId: string): Question[] {

  const paperId = ensurePsychometricPaperId(testId);
  const seed = hashStringToSeed(`${paperId}║${testId}`);
  const indices = sampleUniqueIndices(
    seed,
    PSYCHOMETRIC_FALLBACK_QUESTION_COUNT,
    PSYCHOMETRIC_POOL_SIZE
  );

  return indices.map((globalIdx, slot) => {
    const row = psychometricQuestionFromIndex(globalIdx);
    return {
      ...row,
      id: `ps:${paperId.slice(0, 8)}:${slot}:${globalIdx}`,
    };
  });
}
