import type { Question } from '@/lib/types';
import { normalizeQuestionStem } from '@/lib/questions/dedupe-questions';
import { remixMcqOptions } from '@/lib/competitive-exam/question-factory';
import { forkRng, shuffleInPlace } from '@/lib/competitive-exam/seed-rng';
import {
  generateMathsQuestions,
  generateAptitudeQuestions,
  generateReasoningQuestions,
  generateLogicalQuestions,
} from '@/lib/competitive-exam/generators';
import {
  STATIC_SCIENCE,
  STATIC_CHEMISTRY,
  STATIC_ENGLISH,
  STATIC_COMPUTER,
} from '@/lib/competitive-exam/static-pools';

/** Balanced sections — totals 60 questions per sitting. */
export const COMPETITIVE_TOPIC_ALLOCATION: Record<string, number> = {
  'competitive-maths': 8,
  'competitive-science': 7,
  'competitive-chemistry': 7,
  'competitive-aptitude': 8,
  'competitive-reasoning': 8,
  'competitive-logical': 8,
  'competitive-english': 7,
  'competitive-computer': 7,
};

const STATIC_BY_TOPIC: Record<string, Question[]> = {
  'competitive-science': STATIC_SCIENCE,
  'competitive-chemistry': STATIC_CHEMISTRY,
  'competitive-english': STATIC_ENGLISH,
  'competitive-computer': STATIC_COMPUTER,
};

function normalizeStem(q: Question): string {
  return `${q.category_id}|${normalizeQuestionStem(q.question_text ?? '')}`;
}

function buildTopicPool(topic: string, seed: string): Question[] {
  const rngGen = forkRng(seed, `gen-${topic}`);
  const prefix = `${seed}-${topic}`;
  switch (topic) {
    case 'competitive-maths':
      return generateMathsQuestions(rngGen, 180, prefix);
    case 'competitive-aptitude':
      return generateAptitudeQuestions(rngGen, 180, prefix);
    case 'competitive-reasoning':
      return generateReasoningQuestions(rngGen, 180, prefix);
    case 'competitive-logical':
      return generateLogicalQuestions(rngGen, 180, prefix);
    default:
      return STATIC_BY_TOPIC[topic] ? [...STATIC_BY_TOPIC[topic]] : [];
  }
}

/**
 * Builds one exam paper: stratified sampling + session shuffle.
 * Maths/aptitude/reasoning/logical stems vary heavily per seed → low overlap across thousands of candidates.
 */
export function buildCompetitiveExamPaper(seed: string): Question[] {
  const seen = new Set<string>();
  const picked: Question[] = [];

  for (const [topic, need] of Object.entries(COMPETITIVE_TOPIC_ALLOCATION)) {
    const pool = buildTopicPool(topic, seed);
    const rngPick = forkRng(seed, `pick-${topic}`);
    shuffleInPlace(pool, rngPick);
    let taken = 0;
    for (const q of pool) {
      if (taken >= need) break;
      const key = normalizeStem(q);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ ...q, category_id: topic });
      taken++;
    }
  }

  for (let i = 0; i < picked.length; i++) {
    picked[i] = remixMcqOptions(picked[i], forkRng(seed, `rx-${i}`));
  }

  shuffleInPlace(picked, forkRng(seed, 'final-order'));

  picked.forEach((q, idx) => {
    q.id = `cae-${seed.slice(0, 24)}-${idx}`;
  });

  return picked;
}
