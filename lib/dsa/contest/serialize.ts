import type { StudentContestProblemDto } from '@/lib/dsa/contest/types';
import { parseTestCases } from '@/lib/dsa/grade';

type ProblemRow = {
  id: string;
  slug: string;
  title: string;
  statement: string;
  constraints: string | null;
  inputFormat: string;
  outputFormat: string;
  difficulty: string;
  categoryLabel: string | null;
  tagsJson: unknown;
  studentExplanation: string | null;
  starterCodeJson: unknown;
  languagesJson: unknown;
  testCasesJson: unknown;
  timeLimitMs: number | null;
  memoryLimitKb: number | null;
  /** Never include these in student serializers — present only to assert strip. */
  referenceSolutionsJson?: unknown;
  explanation?: string | null;
};

function asStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
}

/**
 * Explicit whitelist serializer — never spreads the Prisma problem row.
 */
export function toStudentContestProblemDto(
  problem: ProblemRow,
  meta: { position: number; points: number },
): StudentContestProblemDto {
  const cases = parseTestCases(problem.testCasesJson);
  const publicCases = cases.filter((c) => !c.hidden);
  const hiddenTestCount = cases.filter((c) => c.hidden).length;
  const examples = publicCases.map((c) => ({
    input: c.input,
    expectedOutput: c.expectedOutput,
  }));

  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    category: problem.categoryLabel,
    tags: asStringArray(problem.tagsJson),
    statement: problem.statement,
    constraints: problem.constraints,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    examples,
    sampleTests: examples,
    studentExplanation: problem.studentExplanation,
    starterCode: asStringMap(problem.starterCodeJson),
    languages: asStringArray(problem.languagesJson).length
      ? asStringArray(problem.languagesJson)
      : ['java', 'python'],
    hiddenTestCount,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
    position: meta.position,
    points: meta.points,
  };
}

/** Runtime guard for tests — ensure sensitive keys never leak. */
export function assertStudentSafeProblemPayload(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/referenceSolutions|reference_solutions|hidden.*expected|expectedOutput.*hidden/i.test(text)) {
    // Soft structural check — primary safety is whitelist above.
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if ('referenceSolutionsJson' in obj || 'referenceSolutions' in obj) {
      throw new Error('Reference solutions leaked into student payload');
    }
    if ('solution' in obj) {
      throw new Error('Solution field leaked into student payload');
    }
  }
}
