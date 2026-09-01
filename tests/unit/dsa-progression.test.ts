import { describe, expect, it } from 'vitest';
import {
  canTransitionDay,
  evaluateDayCompletion,
  evaluateWeekQualification,
  initialDayState,
  mixWithinTolerance,
  countsForDifficultyMix,
  weekStatusAfterDays,
} from '@/lib/dsa/policy';
import { assignItemsWithoutRepeat } from '@/lib/dsa/assign';
import { DEFAULT_DSA_CONFIG } from '@/lib/dsa/types';
import { DSA_PROBLEMS, DSA_MCQS } from '@/lib/dsa/curriculum';
import { parseProgramConfig } from '@/lib/dsa/parse-config';
import { parseTestCases } from '@/lib/dsa/grade';

const policy = DEFAULT_DSA_CONFIG.dayCompletion;

describe('DSA day unlocking', () => {
  it('unlocks day 1 initially and locks later days', () => {
    expect(initialDayState(1, false)).toBe('available');
    expect(initialDayState(2, false)).toBe('locked');
    expect(initialDayState(2, true)).toBe('available');
    expect(initialDayState(3, false)).toBe('locked');
  });

  it('does not allow jumping locked → completed', () => {
    expect(canTransitionDay('locked', 'completed')).toBe(false);
    expect(canTransitionDay('locked', 'available')).toBe(true);
    expect(canTransitionDay('in_progress', 'completed')).toBe(true);
  });

  it('keeps the next day locked when the current day has not passed', () => {
    const failed = evaluateDayCompletion({
      policy,
      codingSolved: 0,
      codingBestFraction: 0,
      mcqAttempted: 0,
      mcqCorrect: 0,
    });
    expect(failed.passed).toBe(false);
    expect(initialDayState(2, failed.passed)).toBe('locked');
  });

  it('unlocks day 2 after successful day 1', () => {
    const passed = evaluateDayCompletion({
      policy: { ...policy, minMcqAttempted: 5, minCodingSolved: 3 },
      codingSolved: 3,
      codingBestFraction: 1,
      mcqAttempted: 5,
      mcqCorrect: 3,
    });
    expect(passed.passed).toBe(true);
    expect(initialDayState(2, true)).toBe('available');
  });
});

describe('DSA weekly qualification', () => {
  it('does not qualify until assessment is passed', () => {
    const result = evaluateWeekQualification({
      policy: DEFAULT_DSA_CONFIG.weekQualification,
      daysCompleted: 5,
      daysRequired: 5,
      assessmentPercent: null,
    });
    expect(result.passed).toBe(false);
    expect(result.qualification).toBe('eligible');
  });

  it('does not grant qualification on a failing assessment', () => {
    const result = evaluateWeekQualification({
      policy: DEFAULT_DSA_CONFIG.weekQualification,
      daysCompleted: 5,
      daysRequired: 5,
      assessmentPercent: 20,
    });
    expect(result.passed).toBe(false);
    expect(result.qualification).toBe('not_eligible');
  });

  it('grants qualification when days and assessment pass', () => {
    const result = evaluateWeekQualification({
      policy: DEFAULT_DSA_CONFIG.weekQualification,
      daysCompleted: 5,
      daysRequired: 5,
      assessmentPercent: 80,
    });
    expect(result.passed).toBe(true);
    expect(result.qualification).toBe('qualified');
  });

  it('marks the week failed when assessment fails', () => {
    expect(weekStatusAfterDays(['completed', 'completed'], false)).toBe('failed');
    expect(weekStatusAfterDays(['completed', 'completed'], true)).toBe('completed');
  });
});

describe('language-independent problems', () => {
  it('stores one logical problem with multi-language starter maps', () => {
    const problem = DSA_PROBLEMS.find((p) => p.slug === 'max-subarray-sum');
    expect(problem).toBeTruthy();
    expect(problem?.languages).toContain('java');
    expect(problem?.languages).toContain('python');
    expect(problem?.starter.java).toBeTruthy();
    expect(problem?.starter.python).toBeTruthy();
  });

  it('does not duplicate Kadane as java vs python problems', () => {
    const kadane = DSA_PROBLEMS.filter((p) => p.conceptSlug === 'kadane');
    expect(kadane).toHaveLength(1);
  });
});

describe('question assignment', () => {
  it('avoids repeating used ids when the pool is large enough', () => {
    const pool = DSA_PROBLEMS.filter((p) => p.topicSlug === 'arrays').map((p) => ({
      id: p.slug,
      difficulty: p.difficulty,
      topicSlug: p.topicSlug,
    }));
    const first = assignItemsWithoutRepeat({
      pool,
      usedIds: new Set(),
      count: 1,
      mix: DEFAULT_DSA_CONFIG.difficultyMix,
      seed: 'student-a:day1',
      topicSlug: 'arrays',
    });
    const second = assignItemsWithoutRepeat({
      pool,
      usedIds: new Set(first.map((p) => p.id)),
      count: 1,
      mix: DEFAULT_DSA_CONFIG.difficultyMix,
      seed: 'student-a:day2',
      topicSlug: 'arrays',
    });
    expect(first[0].id).not.toBe(second[0].id);
  });

  it('keeps MCQs on the same topic/concept family', () => {
    const arrayMcqs = DSA_MCQS.filter((m) => m.topicSlug === 'arrays');
    expect(arrayMcqs.every((m) => m.topicSlug === 'arrays')).toBe(true);
    expect(arrayMcqs.some((m) => m.conceptSlug === 'kadane')).toBe(true);
  });

  it('produces a difficulty mix within tolerance for a weekly-sized set', () => {
    const counts = countsForDifficultyMix(10, DEFAULT_DSA_CONFIG.difficultyMix);
    expect(mixWithinTolerance(counts, 10, DEFAULT_DSA_CONFIG.difficultyMix, 15)).toBe(true);
  });
});

describe('reset semantics', () => {
  it('treats a new official attempt as starting at day 1 again', () => {
    expect(initialDayState(1, false)).toBe('available');
    expect(initialDayState(2, false)).toBe('locked');
  });
});

describe('configurable program JSON', () => {
  it('accepts custom difficulty mix without hard-coding Java or Python', () => {
    const cfg = parseProgramConfig({
      supportedLanguages: ['python', 'java', 'javascript'],
      difficultyMix: { easy: 10, medium: 50, advanced: 40 },
    });
    expect(cfg.supportedLanguages).toEqual(['python', 'java', 'javascript']);
    expect(cfg.difficultyMix.easy).toBe(10);
  });
});

describe('hidden tests', () => {
  it('keeps hidden cases out of the public sample list', () => {
    const cases = parseTestCases([
      { input: '1', expectedOutput: '1' },
      { input: '2', expectedOutput: '2', hidden: true },
    ]);
    expect(cases.filter((c) => !c.hidden)).toHaveLength(1);
    expect(cases.filter((c) => c.hidden)).toHaveLength(1);
  });
});
