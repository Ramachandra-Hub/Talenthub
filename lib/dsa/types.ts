import type { CodingLanguageId } from '@/lib/coding/languages';

export const DSA_DAY_STATES = ['locked', 'available', 'in_progress', 'completed', 'failed'] as const;
export type DsaDayState = (typeof DSA_DAY_STATES)[number];

export const DSA_WEEK_STATES = ['locked', 'in_progress', 'completed', 'failed'] as const;
export type DsaWeekState = (typeof DSA_WEEK_STATES)[number];

export const DSA_QUAL_STATES = ['not_eligible', 'eligible', 'qualified'] as const;
export type DsaQualState = (typeof DSA_QUAL_STATES)[number];

export const DSA_DIFFICULTIES = ['easy', 'medium', 'advanced'] as const;
export type DsaDifficulty = (typeof DSA_DIFFICULTIES)[number];

export const DSA_ATTEMPT_KINDS = ['official', 'practice'] as const;
export type DsaAttemptKind = (typeof DSA_ATTEMPT_KINDS)[number];

export type DsaDayCompletionPolicy = {
  minCodingSolved: number;
  minCodingPassFraction: number;
  minMcqAttempted: number;
  minMcqPercent: number;
};

export type DsaWeekQualificationPolicy = {
  requireAllDaysCompleted: boolean;
  weeklyAssessmentMinPercent: number;
};

export type DsaDifficultyMix = {
  easy: number;
  medium: number;
  advanced: number;
};

export type DsaProgramConfig = {
  supportedLanguages: CodingLanguageId[];
  defaultLanguage: CodingLanguageId;
  dayCompletion: DsaDayCompletionPolicy;
  weekQualification: DsaWeekQualificationPolicy;
  difficultyMix: DsaDifficultyMix;
  codingProblemsPerDay: number;
  mcqsPerDay: number;
  weeklyAssessmentMcqs: number;
  mixTolerancePercent: number;
};

export const DEFAULT_DSA_CONFIG: DsaProgramConfig = {
  supportedLanguages: ['java', 'python', 'c', 'cpp', 'javascript'],
  defaultLanguage: 'java',
  dayCompletion: {
    minCodingSolved: 1,
    minCodingPassFraction: 1,
    minMcqAttempted: 2,
    minMcqPercent: 50,
  },
  weekQualification: {
    requireAllDaysCompleted: true,
    weeklyAssessmentMinPercent: 50,
  },
  difficultyMix: { easy: 20, medium: 40, advanced: 40 },
  codingProblemsPerDay: 1,
  mcqsPerDay: 2,
  weeklyAssessmentMcqs: 4,
  mixTolerancePercent: 15,
};

export type DsaTestCase = {
  input: string;
  expectedOutput: string;
  hidden?: boolean;
  explanation?: string;
};

export type StarterCodeMap = Partial<Record<CodingLanguageId, string>>;
