import type { Question } from '@/lib/types';
import { shuffleInPlace } from '@/lib/competitive-exam/seed-rng';
import { normalizeQuestionStem } from '@/lib/questions/dedupe-questions';

export function questionStemKey(q: Question): string {
  return normalizeQuestionStem(q.question_text ?? '');
}

/** Pick up to `count` items with unique keys (non-repeating stems / families). */
export function pickUniqueByKey<T>(
  pool: T[],
  count: number,
  rng: () => number,
  keyFn: (item: T) => string,
  globalSeen?: Set<string>,
): T[] {
  const shuffled = [...pool];
  shuffleInPlace(shuffled, rng);
  const localSeen = new Set<string>();
  const out: T[] = [];
  for (const item of shuffled) {
    const key = keyFn(item);
    if (!key || localSeen.has(key)) continue;
    if (globalSeen?.has(key)) continue;
    localSeen.add(key);
    globalSeen?.add(key);
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

function filterMcqsNotSeen(pool: Question[], globalSeen?: Set<string>): Question[] {
  if (!globalSeen?.size) return pool;
  return pool.filter((q) => {
    const key = questionStemKey(q);
    return Boolean(key) && !globalSeen.has(key);
  });
}

/** Build a unique MCQ list; expands generation if the pool is too small. */
export function pickUniqueMcqs(
  pool: Question[],
  count: number,
  rng: () => number,
  generateMore: (needed: number) => Question[],
  globalSeen?: Set<string>,
): Question[] {
  let working = filterMcqsNotSeen(pool, globalSeen);
  let picked = pickUniqueByKey(working, count, rng, questionStemKey, globalSeen);
  let guard = 0;
  while (picked.length < count && guard < 8) {
    guard += 1;
    const more = filterMcqsNotSeen(generateMore(count * 4), globalSeen);
    working = [...working, ...more];
    picked = pickUniqueByKey(working, count, rng, questionStemKey, globalSeen);
  }
  return picked.slice(0, count);
}
