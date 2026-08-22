import { isCodingQuestion } from '@/lib/practice-mappers';
import type { Question } from '@/lib/types';
import { normalizeAttemptRound } from '@/lib/exam-attempt-round';

export const JAVA_TODAY_SLOT_KEY = 'java-today-50';
export const JAVA_TODAY_MARKER = '[java-today-50]';
export const JAVA_TODAY_EXAM_KIND = 'java-today-50';

export const JAVA_TODAY_MCQ_COUNT = 15;
export const JAVA_TODAY_MCQ_MARKS_EACH = 2;
export const JAVA_TODAY_MCQ_MARKS = JAVA_TODAY_MCQ_COUNT * JAVA_TODAY_MCQ_MARKS_EACH;

export const JAVA_TODAY_CODING_COUNT = 2;
/** Each coding question is out of 20; only the better attempt counts. */
export const JAVA_TODAY_CODING_MARKS = 20;
export const JAVA_TODAY_TOTAL_MARKS = JAVA_TODAY_MCQ_MARKS + JAVA_TODAY_CODING_MARKS;

export const JAVA_TODAY_POOL_MCQ = 45;
export const JAVA_TODAY_DURATION_MINUTES = 90;

export const JAVA_TODAY_NOTICE =
  'Java exam today: 15 MCQs × 2 marks = 30. Two Java coding questions from the uploaded document (20 marks each). Attempt one or both — the better coding score counts (20). Total 50 marks. Each student gets a unique coding pair.';

export function isJavaTodayExamMeta(meta: {
  slotKey?: string | null;
  description?: string | null;
  title?: string | null;
  topic?: string | null;
}): boolean {
  if ((meta.slotKey ?? '').trim() === JAVA_TODAY_SLOT_KEY) return true;
  const blob = `${meta.description ?? ''} ${meta.title ?? ''} ${meta.topic ?? ''}`;
  return blob.includes(JAVA_TODAY_MARKER) || blob.includes(JAVA_TODAY_SLOT_KEY);
}

export function javaTodayPaperSeed(userId: string, testId: string, attemptRound?: number | null): string {
  return `${userId.trim()}:${testId.trim()}:${normalizeAttemptRound(attemptRound)}`;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let state = hashSeed(seed) || 1;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function uniquePairIndices(n: number, seed: string): [number, number] {
  if (n <= 1) return [0, 0];
  if (n === 2) return [0, 1];
  const pairCount = (n * (n - 1)) / 2;
  let k = hashSeed(seed) % pairCount;
  for (let i = 0; i < n - 1; i += 1) {
    const remaining = n - 1 - i;
    if (k < remaining) return [i, i + 1 + k];
    k -= remaining;
  }
  return [0, 1];
}

export function selectJavaTodayPaper(
  questions: Question[],
  seed: string,
  examKey?: string,
): Question[] {
  const mcq = seededShuffle(
    questions.filter((q) => !isCodingQuestion(q)),
    `${seed}:mcq`,
  ).slice(0, JAVA_TODAY_MCQ_COUNT);
  const codingPool = seededShuffle(
    questions.filter((q) => isCodingQuestion(q)),
    `${examKey ?? seed}:coding-matrix`,
  );
  if (codingPool.length <= JAVA_TODAY_CODING_COUNT) {
    return [...mcq, ...codingPool];
  }
  const [i, j] = uniquePairIndices(codingPool.length, `${seed}:coding-pair`);
  const a = codingPool[i];
  const b = codingPool[j];
  const coding = a.id === b.id ? codingPool.slice(0, JAVA_TODAY_CODING_COUNT) : [a, b];
  return [...mcq, ...coding];
}

export function javaTodayExamTitle(now = new Date()): string {
  const day = now.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  return `Java Assessment · ${day}`;
}

export function javaTodayDescription(): string {
  return `${JAVA_TODAY_MARKER} ${JAVA_TODAY_NOTICE} MCQs are unique per student. Coding questions are taken only from the uploaded document, assigned as a unique pair (no repeats within a paper).`;
}
