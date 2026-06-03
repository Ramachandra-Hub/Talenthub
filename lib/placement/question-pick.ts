import type { Question } from '@/lib/types';
import { shuffleInPlace } from '@/lib/competitive-exam/seed-rng';

export function questionStemKey(q: Question): string {
  return (q.question_text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Pick up to `count` items with unique keys (non-repeating stems / families). */
export function pickUniqueByKey<T>(
  pool: T[],
  count: number,
  rng: () => number,
  keyFn: (item: T) => string,
): T[] {
  const shuffled = [...pool];
  shuffleInPlace(shuffled, rng);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of shuffled) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

/** Build a unique MCQ list; expands generation if the pool is too small. */
export function pickUniqueMcqs(
  pool: Question[],
  count: number,
  rng: () => number,
  generateMore: (needed: number) => Question[],
): Question[] {
  let working = [...pool];
  let picked = pickUniqueByKey(working, count, rng, questionStemKey);
  let guard = 0;
  while (picked.length < count && guard < 8) {
    guard += 1;
    const more = generateMore(count * 4);
    working = [...working, ...more];
    picked = pickUniqueByKey(working, count, rng, questionStemKey);
  }
  return picked.slice(0, count);
}
