import { describe, expect, it } from 'vitest';
import { evaluateJourneyDayAccess, resolveFocusProblemId } from '@/lib/dsa/journey-missions';
import { resolveCodeLabHref } from '@/lib/dsa-arena/resolve-code-lab';
import {
  DSA_JOURNEY_INTENTIONALLY_UNMAPPED,
  DSA_JOURNEY_MISSION_SEEDS,
} from '@/lib/dsa/journey-mission-seeds';

describe('legacy heuristic resolver removed', () => {
  it('resolveCodeLabHref always returns null (no dayNumberHint / title / soft fallback)', () => {
    expect(
      resolveCodeLabHref(
        { id: 'sorting', title: 'Sorting', topicSlug: 'sorting' } as never,
        {
          id: 'insertion-sort',
          title: 'Insertion Sort',
          dayNumberHint: 3,
          codeLabHref: '/dsa/day/should-not-use',
        } as never,
        {
          weeks: [
            {
              id: 'w',
              title: 'Sorting',
              topicName: 'Sorting',
              topicSlug: 'sorting',
              status: 'in_progress',
              days: [
                { id: 'day-c', dayNumber: 3, title: 'Insertion Sort', status: 'available' },
                { id: 'open', dayNumber: 1, title: 'Other', status: 'available' },
              ],
            },
          ],
        },
      ),
    ).toBeNull();
  });
});

describe('journey mission seed integrity', () => {
  it('seeds only explicit mission keys with week topic + day number', () => {
    expect(DSA_JOURNEY_MISSION_SEEDS.length).toBeGreaterThan(0);
    for (const seed of DSA_JOURNEY_MISSION_SEEDS) {
      expect(seed.missionKey).toBeTruthy();
      expect(seed.topicKey).toBeTruthy();
      expect(seed.weekTopicSlug).toBeTruthy();
      expect(seed.dayNumber).toBeGreaterThanOrEqual(1);
      expect(seed.dayNumber).toBeLessThanOrEqual(5);
    }
  });

  it('does not seed intentionally unmapped missions', () => {
    const keys = new Set(DSA_JOURNEY_MISSION_SEEDS.map((s) => s.missionKey));
    for (const key of DSA_JOURNEY_INTENTIONALLY_UNMAPPED) {
      expect(keys.has(key)).toBe(false);
    }
  });

  it('keeps unmapped-preview unmapped', () => {
    expect(DSA_JOURNEY_MISSION_SEEDS.some((s) => s.missionKey === 'unmapped-preview')).toBe(
      false,
    );
  });

  it('uses unique mission keys', () => {
    const keys = DSA_JOURNEY_MISSION_SEEDS.map((s) => s.missionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('evaluateJourneyDayAccess', () => {
  const okBase = {
    mappingActive: true,
    dayExists: true,
    rosterOk: true,
    weekUnlocked: true,
    hasActiveAttempt: true,
    dayProgressStatus: 'available' as string | null,
  };

  it('allows an authorized available day', () => {
    expect(evaluateJourneyDayAccess(okBase)).toEqual({ accessible: true, reason: null });
  });

  it('denies inactive mapping', () => {
    expect(evaluateJourneyDayAccess({ ...okBase, mappingActive: false }).accessible).toBe(false);
  });

  it('denies missing day', () => {
    expect(evaluateJourneyDayAccess({ ...okBase, dayExists: false }).accessible).toBe(false);
  });

  it('denies unauthorized roster', () => {
    expect(evaluateJourneyDayAccess({ ...okBase, rosterOk: false }).accessible).toBe(false);
  });

  it('denies locked week', () => {
    expect(evaluateJourneyDayAccess({ ...okBase, weekUnlocked: false }).accessible).toBe(false);
  });

  it('denies locked day progress', () => {
    expect(
      evaluateJourneyDayAccess({ ...okBase, dayProgressStatus: 'locked' }).accessible,
    ).toBe(false);
  });

  it('denies missing attempt', () => {
    expect(evaluateJourneyDayAccess({ ...okBase, hasActiveAttempt: false }).accessible).toBe(
      false,
    );
  });
});

describe('resolveFocusProblemId', () => {
  it('returns null when focus slug is not assigned to the student', () => {
    expect(
      resolveFocusProblemId({
        focusProblemSlug: 'bubble-sort-demo',
        problemIdBySlug: new Map([['bubble-sort-demo', 'prob-1']]),
        assignedProblemIds: new Set(['other-prob']),
      }),
    ).toBeNull();
  });

  it('returns problem id only when assigned', () => {
    expect(
      resolveFocusProblemId({
        focusProblemSlug: 'bubble-sort-demo',
        problemIdBySlug: new Map([['bubble-sort-demo', 'prob-1']]),
        assignedProblemIds: new Set(['prob-1']),
      }),
    ).toBe('prob-1');
  });

  it('returns null when slug missing from catalog', () => {
    expect(
      resolveFocusProblemId({
        focusProblemSlug: 'missing',
        problemIdBySlug: new Map(),
        assignedProblemIds: new Set(['prob-1']),
      }),
    ).toBeNull();
  });
});
