import type { Question } from '@/lib/types';
import { generateAptitudeQuestions } from '@/lib/competitive-exam/generators';
import { remixMcqOptions } from '@/lib/competitive-exam/question-factory';
import { forkRng } from '@/lib/competitive-exam/seed-rng';
import {
  findDepartment,
  getPlacementSection,
  TECHNICAL_CODING_COUNT,
  TECHNICAL_MCQ_COUNT,
} from '@/lib/placement/config';
import { placementIntelligenceBank } from '@/lib/placement/intelligence-bank';
import { placementLogicBank } from '@/lib/placement/logic-bank';
import {
  generateIntelligenceQuestions,
  generatePlacementLogicQuestions,
  generatePsychometricQuestions,
  generateTechnicalQuestions,
} from '@/lib/placement/placement-generators';
import { placementPsychometricBank } from '@/lib/placement/psychometric-bank';
import { pickUniqueMcqs, questionStemKey } from '@/lib/placement/question-pick';
import { technicalBankForDepartment } from '@/lib/placement/technical-banks';
import type { PlacementSectionId, PlacementTechnicalFormat } from '@/lib/placement/types';
import { buildTechnicalCodingProblems } from '@/lib/placement/technical-coding-problems';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';

/** Pool size multiplier — generates many unique stems per student seed (supports 1000+ writers). */
const GENERATED_POOL_MULTIPLIER = 16;

function sectionSeed(base: string, sectionId: string, departmentId: string): string {
  return `${base}|${departmentId}|${sectionId}`;
}

function buildTechnicalMcq(
  seed: string,
  departmentId: string,
  count: number,
  globalSeen: Set<string>,
): Question[] {
  const dept = findDepartment(departmentId) ?? findDepartment('cse')!;
  const curated = technicalBankForDepartment(dept).filter((q) => {
    const key = questionStemKey(q);
    return key && !globalSeen.has(key);
  });
  const seedKey = sectionSeed(seed, 'technical-mcq', departmentId);
  const genRng = forkRng(seedKey, 'tech-mcq-gen');

  const generateMore = (needed: number) =>
    generateTechnicalQuestions(
      dept.technicalCategory,
      genRng,
      needed,
      `placement-tech-${seed.slice(0, 12)}`,
    );

  const initial = [
    ...curated,
    ...generateTechnicalQuestions(
      dept.technicalCategory,
      genRng,
      count * GENERATED_POOL_MULTIPLIER,
      `placement-tech-${seed.slice(0, 12)}`,
    ),
  ];

  const rng = forkRng(seedKey, 'tech-mcq-pick');
  const picked = pickUniqueMcqs(initial, count, rng, generateMore, globalSeen);

  return picked.map((q, i) => {
    const remixed = remixMcqOptions(q, forkRng(seedKey, `tech-remix-${i}`));
    return { ...remixed, id: `placement-tech-mcq-${i + 1}` };
  });
}

function buildPsychometric(
  seed: string,
  departmentId: string,
  count: number,
  globalSeen: Set<string>,
): Question[] {
  const seedKey = sectionSeed(seed, 'psychometric', departmentId);
  const curated = placementPsychometricBank().filter((q) => {
    const key = questionStemKey(q);
    return key && !globalSeen.has(key);
  });
  const genRng = forkRng(seedKey, 'psy-gen');
  const generateMore = (needed: number) =>
    generatePsychometricQuestions(genRng, needed, `placement-psy-${seed.slice(0, 8)}`);
  const pool = [
    ...curated,
    ...generatePsychometricQuestions(
      genRng,
      count * GENERATED_POOL_MULTIPLIER,
      `placement-psy-${seed.slice(0, 8)}`,
    ),
  ];
  const rng = forkRng(seedKey, 'psy-pick');
  const picked = pickUniqueMcqs(pool, count, rng, generateMore, globalSeen);
  return picked.map((q, i) => {
    const remixed = remixMcqOptions(q, forkRng(seedKey, `psy-remix-${i}`));
    return { ...remixed, id: `placement-psy-${i + 1}` };
  });
}

function buildAptitude(
  seed: string,
  departmentId: string,
  count: number,
  globalSeen: Set<string>,
): Question[] {
  const seedKey = sectionSeed(seed, 'aptitude', departmentId);
  const rng = forkRng(seedKey, 'apt-gen');
  const out: Question[] = [];
  let guard = 0;
  while (out.length < count && guard < 12) {
    guard += 1;
    const batch = generateAptitudeQuestions(
      rng,
      count - out.length,
      `placement-apt-${seed.slice(0, 8)}-${guard}`,
    );
    for (const q of batch) {
      const key = questionStemKey(q);
      if (!key || globalSeen.has(key)) continue;
      globalSeen.add(key);
      out.push({
        ...q,
        id: `placement-apt-${out.length + 1}`,
        category_id: 'placement-aptitude',
      });
      if (out.length >= count) break;
    }
  }
  return out.slice(0, count);
}

function buildLogic(
  seed: string,
  departmentId: string,
  count: number,
  globalSeen: Set<string>,
): Question[] {
  const seedKey = sectionSeed(seed, 'logic', departmentId);
  const curated = placementLogicBank().filter((q) => {
    const key = questionStemKey(q);
    return key && !globalSeen.has(key);
  });
  const genRng = forkRng(seedKey, 'logic-gen');
  const generateMore = (needed: number) =>
    generatePlacementLogicQuestions(genRng, needed, `placement-logic-${seed.slice(0, 8)}`);
  const pool = [
    ...curated,
    ...generatePlacementLogicQuestions(
      genRng,
      count * GENERATED_POOL_MULTIPLIER,
      `placement-logic-${seed.slice(0, 8)}`,
    ),
  ];
  const rng = forkRng(seedKey, 'logic-pick');
  const picked = pickUniqueMcqs(pool, count, rng, generateMore, globalSeen);
  return picked.map((q, i) => {
    const remixed = remixMcqOptions(q, forkRng(seedKey, `logic-remix-${i}`));
    return { ...remixed, id: `placement-logic-${i + 1}` };
  });
}

function buildIntelligence(
  seed: string,
  departmentId: string,
  count: number,
  globalSeen: Set<string>,
): Question[] {
  const seedKey = sectionSeed(seed, 'intelligence', departmentId);
  const curated = placementIntelligenceBank().filter((q) => {
    const key = questionStemKey(q);
    return key && !globalSeen.has(key);
  });
  const genRng = forkRng(seedKey, 'iq-gen');
  const generateMore = (needed: number) =>
    generateIntelligenceQuestions(genRng, needed, `placement-iq-${seed.slice(0, 8)}`);
  const pool = [
    ...curated,
    ...generateIntelligenceQuestions(
      genRng,
      count * GENERATED_POOL_MULTIPLIER,
      `placement-iq-${seed.slice(0, 8)}`,
    ),
  ];
  const rng = forkRng(seedKey, 'iq-pick');
  const picked = pickUniqueMcqs(pool, count, rng, generateMore, globalSeen);
  return picked.map((q, i) => {
    const remixed = remixMcqOptions(q, forkRng(seedKey, `iq-remix-${i}`));
    return { ...remixed, id: `placement-iq-${i + 1}` };
  });
}

/** Build question pools for one placement session (unique per student across all sections). */
export function buildPlacementQuestions(
  seed: string,
  departmentId: string,
  technicalFormat: PlacementTechnicalFormat,
): {
  technicalMcq: Question[];
  technicalCoding: ProgrammingProblem[];
  psychometric: Question[];
  aptitude: Question[];
  logic: Question[];
  intelligence: Question[];
} {
  const globalSeen = new Set<string>();
  const mcqCount =
    technicalFormat === 'mcq' || technicalFormat === 'both' ? TECHNICAL_MCQ_COUNT : 0;
  const codingCount =
    technicalFormat === 'coding' || technicalFormat === 'both' ? TECHNICAL_CODING_COUNT : 0;

  const psychometric = buildPsychometric(
    seed,
    departmentId,
    getPlacementSection('psychometric').questionCount ?? 15,
    globalSeen,
  );
  const aptitude = buildAptitude(
    seed,
    departmentId,
    getPlacementSection('aptitude').questionCount ?? 20,
    globalSeen,
  );
  const logic = buildLogic(
    seed,
    departmentId,
    getPlacementSection('logic').questionCount ?? 15,
    globalSeen,
  );
  const intelligence = buildIntelligence(
    seed,
    departmentId,
    getPlacementSection('intelligence').questionCount ?? 15,
    globalSeen,
  );
  const technicalMcq =
    mcqCount > 0 ? buildTechnicalMcq(seed, departmentId, mcqCount, globalSeen) : [];
  const technicalCoding =
    codingCount > 0 ? buildTechnicalCodingProblems(seed, departmentId) : [];

  return {
    technicalMcq,
    technicalCoding,
    psychometric,
    aptitude,
    logic,
    intelligence,
  };
}
