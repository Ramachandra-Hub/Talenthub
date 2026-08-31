import type { DsaDifficulty, DsaDifficultyMix } from '@/lib/dsa/types';
import { countsForDifficultyMix } from '@/lib/dsa/policy';

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

export type AssignableItem = {
  id: string;
  difficulty: DsaDifficulty;
  topicSlug?: string;
};

/**
 * Pick unique items for a student day, skipping previously assigned ids,
 * preferring the configured difficulty mix, then filling from leftovers.
 */
export function assignItemsWithoutRepeat<T extends AssignableItem>(input: {
  pool: T[];
  usedIds: Set<string>;
  count: number;
  mix: DsaDifficultyMix;
  seed: string;
  topicSlug?: string;
}): T[] {
  const topicPool = input.topicSlug
    ? input.pool.filter((p) => !p.topicSlug || p.topicSlug === input.topicSlug)
    : input.pool;
  const fresh = topicPool.filter((p) => !input.usedIds.has(p.id));
  const source = fresh.length >= input.count ? fresh : topicPool;
  const shuffled = seededShuffle(source, input.seed);
  const targets = countsForDifficultyMix(input.count, input.mix);
  const picked: T[] = [];
  const take = (diff: DsaDifficulty, n: number) => {
    for (const item of shuffled) {
      if (picked.length >= input.count) break;
      if (picked.some((p) => p.id === item.id)) continue;
      if (item.difficulty !== diff) continue;
      if (n <= 0) continue;
      picked.push(item);
      n -= 1;
    }
  };
  take('easy', targets.easy);
  take('medium', targets.medium);
  take('advanced', targets.advanced);
  for (const item of shuffled) {
    if (picked.length >= input.count) break;
    if (picked.some((p) => p.id === item.id)) continue;
    picked.push(item);
  }
  return picked.slice(0, input.count);
}
