import { loadQuestionsForTakePrisma } from '@/lib/db/test-attempts-prisma';
import type { Question } from '@/lib/types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

type CacheEntry = {
  questions: Question[];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function pruneCache(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < oldest.length - MAX_ENTRIES; i++) {
    cache.delete(oldest[i][0]);
  }
}

/** Cached question load for server scoring — avoids re-reading the full bank on every progress POST. */
export async function loadQuestionsForScoringCached(testId: string): Promise<Question[]> {
  const key = testId.trim();
  if (!key) return [];

  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.questions;
  }

  const questions = (await loadQuestionsForTakePrisma(key, { fullPool: true })) as Question[];
  cache.set(key, { questions, expiresAt: now + CACHE_TTL_MS });
  pruneCache();
  return questions;
}

export function invalidateQuestionScoreCache(testId: string): void {
  cache.delete(testId.trim());
}
