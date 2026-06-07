import type { FacultyExamQuestion, FacultyMcqQuestion } from '@/lib/faculty-exams';
import type { Question } from '@/lib/types';
import { forkRng } from '@/lib/competitive-exam/seed-rng';
import {
  generateAptitudeQuestions,
  generateLogicalQuestions,
  generateMathsQuestions,
  generateReasoningQuestions,
} from '@/lib/competitive-exam/generators';
import { generateTechnicalQuestions } from '@/lib/placement/placement-generators';
import type { PlacementDepartment } from '@/lib/placement/types';
import { CURATED_BANK_MARKER, getCuratedBaseMcqsForSlug } from '@/lib/question-bank/curated-mcqs';

export const DEFAULT_SYLLABUS_QUESTIONS_PER_TOPIC = 150;
export const MAX_SYLLABUS_QUESTIONS_PER_TOPIC = 200;

type GeneratorKind = 'maths' | 'aptitude' | 'reasoning' | 'logical' | 'technical' | 'verbal';

function kindForSlug(slug: string): GeneratorKind {
  if (
    slug === 'aptitude-percentages' ||
    slug === 'aptitude-number-systems' ||
    slug === 'aptitude-pnc' ||
    slug === 'aptitude-probability' ||
    slug === 'aptitude-interest' ||
    slug === 'quantitative-aptitude'
  ) {
    return 'maths';
  }
  if (slug.startsWith('aptitude-')) return 'aptitude';
  if (slug.startsWith('logical-') || slug === 'logical-reasoning') return 'logical';
  if (
    slug.startsWith('verbal-') ||
    slug === 'verbal-ability' ||
    slug === 'english-grammar'
  ) {
    return 'verbal';
  }
  if (
    slug.startsWith('technical-') ||
    slug === 'dsa' ||
    slug === 'dbms' ||
    slug === 'operating-systems' ||
    slug === 'computer-science' ||
    slug === 'electronics' ||
    slug === 'mechanical'
  ) {
    return 'technical';
  }
  return 'aptitude';
}

function technicalCategoryForSlug(slug: string): PlacementDepartment['technicalCategory'] {
  if (slug.includes('electronic')) return 'ece';
  if (slug.includes('mechanical')) return 'mechanical';
  if (slug.includes('civil')) return 'civil';
  if (slug.includes('aiml') || slug.includes('ml')) return 'aiml';
  if (slug.includes('cyber')) return 'cyber';
  return 'cse';
}

function questionToFaculty(q: Question): FacultyMcqQuestion {
  const letters = ['A', 'B', 'C', 'D'] as const;
  const opts =
    q.option_a != null && q.option_b != null
      ? [String(q.option_a), String(q.option_b), String(q.option_c), String(q.option_d)]
      : (q.options ?? []).map(String);
  const letter = String(q.correct_answer ?? 'A')
    .toUpperCase()
    .charAt(0) as (typeof letters)[number];
  const idx = letters.indexOf(letter);
  return {
    question_text: q.question_text,
    option_a: opts[0] ?? '',
    option_b: opts[1] ?? '',
    option_c: opts[2] ?? '',
    option_d: opts[3] ?? '',
    correct_answer: letters[idx >= 0 ? idx : 0],
    explanation: q.explanation ?? undefined,
  };
}

function generateBatch(
  slug: string,
  kind: GeneratorKind,
  rng: () => number,
  count: number,
  prefix: string,
): Question[] {
  switch (kind) {
    case 'maths':
      return generateMathsQuestions(rng, count, prefix);
    case 'aptitude':
      return generateAptitudeQuestions(rng, count, prefix);
    case 'reasoning':
    case 'verbal':
      return generateReasoningQuestions(rng, count, prefix);
    case 'logical':
      return generateLogicalQuestions(rng, count, prefix);
    case 'technical':
      return generateTechnicalQuestions(technicalCategoryForSlug(slug), rng, count, prefix);
    default:
      return generateAptitudeQuestions(rng, count, prefix);
  }
}

/**
 * Large unique MCQ pool per syllabus tag — suitable for exams with ~5000 students
 * (draw without replacement from 150+ items per topic).
 */
export function generateSyllabusMcqsForSlug(
  slug: string,
  name: string,
  targetCount = DEFAULT_SYLLABUS_QUESTIONS_PER_TOPIC,
): FacultyMcqQuestion[] {
  const cap = Math.min(MAX_SYLLABUS_QUESTIONS_PER_TOPIC, Math.max(10, targetCount));
  const base = getCuratedBaseMcqsForSlug(slug, name) as FacultyMcqQuestion[];
  const out: FacultyMcqQuestion[] = base.map((q) => ({
    ...q,
    explanation: q.explanation ?? `${CURATED_BANK_MARKER} · ${name}`,
  }));
  const seen = new Set(out.map((q) => q.question_text.trim().toLowerCase()));

  const kind = kindForSlug(slug);
  const batchSize = 25;
  let salt = 0;
  const maxRounds = Math.ceil((cap * 3) / batchSize);

  for (let round = 0; round < maxRounds && out.length < cap; round += 1) {
    salt += 1;
    const rng = forkRng(slug, `pool-${salt}`);
    const batch = generateBatch(slug, kind, rng, batchSize, `${slug}-g${salt}`);
    for (const q of batch) {
      if (out.length >= cap) break;
      const faculty = questionToFaculty(q);
      const key = faculty.question_text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...faculty,
        explanation: faculty.explanation ?? `${CURATED_BANK_MARKER} · ${name} · auto ${out.length + 1}`,
      });
    }
  }

  return out.slice(0, cap);
}
