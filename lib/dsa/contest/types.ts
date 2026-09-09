export const DSA_CONTEST_STATUSES = [
  'draft',
  'published',
  'active',
  'ended',
  'archived',
] as const;
export type DsaContestStatus = (typeof DSA_CONTEST_STATUSES)[number];

export const DSA_CONTEST_ATTEMPT_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'expired',
] as const;
export type DsaContestAttemptStatus = (typeof DSA_CONTEST_ATTEMPT_STATUSES)[number];

export const DSA_REFERENCE_SOLUTION_STATUSES = [
  'missing',
  'needs_validation',
  'validated',
] as const;
export type DsaReferenceSolutionStatus =
  (typeof DSA_REFERENCE_SOLUTION_STATUSES)[number];

export const DSA_FAILURE_TYPES = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'MEMORY_LIMIT',
  'SYSTEM_ERROR',
] as const;
export type DsaFailureType = (typeof DSA_FAILURE_TYPES)[number];

export const CONTEST_BANK_PREFIX = 'tree-network-bank';
export const CONTEST_POINTS_PER_PROBLEM = 100;
export const CONTEST_PROBLEM_COUNT = 3;

/** Student-safe problem DTO — never includes reference solutions or hidden I/O. */
export type StudentContestProblemDto = {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  category: string | null;
  tags: string[];
  statement: string;
  constraints: string | null;
  inputFormat: string;
  outputFormat: string;
  examples: Array<{ input: string; expectedOutput: string }>;
  sampleTests: Array<{ input: string; expectedOutput: string }>;
  studentExplanation: string | null;
  starterCode: Record<string, string>;
  languages: string[];
  hiddenTestCount: number;
  timeLimitMs: number | null;
  /** Memory is reported when available; not hard-enforced by the runner. */
  memoryLimitKb: number | null;
  position: number;
  points: number;
};
