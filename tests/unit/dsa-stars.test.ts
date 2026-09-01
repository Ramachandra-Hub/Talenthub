import { describe, expect, it } from 'vitest';
import { computeDayStars } from '@/lib/dsa/stars';

describe('computeDayStars', () => {
  it('returns 0 for locked days', () => {
    expect(
      computeDayStars({
        status: 'locked',
        codingSolved: 0,
        codingRequired: 3,
        mcqPercent: null,
        mcqAttempted: 0,
        mcqRequired: 5,
      }),
    ).toBe(0);
  });

  it('returns 3 stars for a perfect completed day', () => {
    expect(
      computeDayStars({
        status: 'completed',
        codingSolved: 3,
        codingRequired: 3,
        mcqPercent: 100,
        mcqAttempted: 5,
        mcqRequired: 5,
      }),
    ).toBe(3);
  });
});
