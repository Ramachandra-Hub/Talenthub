import type {
  DsaDayCompletionPolicy,
  DsaDayState,
  DsaDifficulty,
  DsaDifficultyMix,
  DsaQualState,
  DsaWeekQualificationPolicy,
  DsaWeekState,
} from '@/lib/dsa/types';

const DAY_TRANSITIONS: Record<DsaDayState, DsaDayState[]> = {
  locked: ['available'],
  available: ['in_progress', 'locked'],
  in_progress: ['completed', 'failed', 'available'],
  completed: [],
  failed: ['available'],
};

const WEEK_TRANSITIONS: Record<DsaWeekState, DsaWeekState[]> = {
  locked: ['in_progress'],
  in_progress: ['completed', 'failed'],
  completed: [],
  failed: ['in_progress'],
};

export function canTransitionDay(from: DsaDayState, to: DsaDayState): boolean {
  return DAY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionWeek(from: DsaWeekState, to: DsaWeekState): boolean {
  return WEEK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function initialDayState(dayNumber: number, previousCompleted: boolean): DsaDayState {
  if (dayNumber <= 1) return 'available';
  return previousCompleted ? 'available' : 'locked';
}

export function evaluateDayCompletion(input: {
  policy: DsaDayCompletionPolicy;
  codingSolved: number;
  codingBestFraction: number;
  mcqAttempted: number;
  mcqCorrect: number;
}): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.codingSolved < input.policy.minCodingSolved) {
    reasons.push(
      `Solve at least ${input.policy.minCodingSolved} coding problem(s) (currently ${input.codingSolved}).`,
    );
  }
  if (input.codingBestFraction + 1e-9 < input.policy.minCodingPassFraction) {
    reasons.push(
      `Pass ${Math.round(input.policy.minCodingPassFraction * 100)}% of test cases on a coding problem.`,
    );
  }
  if (input.mcqAttempted < input.policy.minMcqAttempted) {
    reasons.push(
      `Attempt at least ${input.policy.minMcqAttempted} MCQs (currently ${input.mcqAttempted}).`,
    );
  }
  const mcqPercent =
    input.mcqAttempted > 0 ? (input.mcqCorrect / input.mcqAttempted) * 100 : 0;
  if (mcqPercent + 1e-9 < input.policy.minMcqPercent) {
    reasons.push(
      `Score at least ${input.policy.minMcqPercent}% on today's MCQs (currently ${Math.round(mcqPercent)}%).`,
    );
  }
  return { passed: reasons.length === 0, reasons };
}

export function evaluateWeekQualification(input: {
  policy: DsaWeekQualificationPolicy;
  daysCompleted: number;
  daysRequired: number;
  assessmentPercent: number | null;
}): { passed: boolean; qualification: DsaQualState; reasons: string[] } {
  const reasons: string[] = [];
  if (input.policy.requireAllDaysCompleted && input.daysCompleted < input.daysRequired) {
    reasons.push(`Complete all ${input.daysRequired} days (currently ${input.daysCompleted}).`);
  }
  if (input.assessmentPercent == null) {
    reasons.push('Complete the weekly assessment.');
    return {
      passed: false,
      qualification: reasons.length && input.daysCompleted >= input.daysRequired ? 'eligible' : 'not_eligible',
      reasons,
    };
  }
  if (input.assessmentPercent + 1e-9 < input.policy.weeklyAssessmentMinPercent) {
    reasons.push(
      `Score at least ${input.policy.weeklyAssessmentMinPercent}% on the weekly assessment (got ${Math.round(input.assessmentPercent)}%).`,
    );
  }
  if (reasons.length) {
    return { passed: false, qualification: 'not_eligible', reasons };
  }
  return { passed: true, qualification: 'qualified', reasons: [] };
}

export function countsForDifficultyMix(
  total: number,
  mix: DsaDifficultyMix,
): Record<DsaDifficulty, number> {
  if (total <= 0) return { easy: 0, medium: 0, advanced: 0 };
  const easy = Math.round((mix.easy / 100) * total);
  const medium = Math.round((mix.medium / 100) * total);
  let advanced = total - easy - medium;
  if (advanced < 0) {
    return { easy, medium: Math.max(0, medium + advanced), advanced: 0 };
  }
  return { easy, medium, advanced };
}

export function mixWithinTolerance(
  actual: Record<DsaDifficulty, number>,
  total: number,
  mix: DsaDifficultyMix,
  tolerancePercent: number,
): boolean {
  if (total <= 0) return true;
  const pct = (n: number) => (n / total) * 100;
  return (
    Math.abs(pct(actual.easy) - mix.easy) <= tolerancePercent &&
    Math.abs(pct(actual.medium) - mix.medium) <= tolerancePercent &&
    Math.abs(pct(actual.advanced) - mix.advanced) <= tolerancePercent
  );
}

export function weekStatusAfterDays(
  dayStatuses: DsaDayState[],
  assessmentPassed: boolean | null,
): DsaWeekState {
  if (dayStatuses.every((s) => s === 'locked')) return 'locked';
  if (assessmentPassed === false) return 'failed';
  if (dayStatuses.every((s) => s === 'completed') && assessmentPassed === true) return 'completed';
  return 'in_progress';
}
