import { describe, expect, it } from 'vitest';
import {
  deriveArenaMissionProgress,
  deriveArenaTopicProgress,
} from '@/lib/dsa/arena-progression';

describe('deriveArenaMissionProgress', () => {
  it('marks unmapped when no mapping exists', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'unmapped-preview',
      topicKey: 'sorting',
      mapping: null,
      day: null,
      weekLocked: false,
      weekLockReason: null,
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });
    expect(row.mapped).toBe(false);
    expect(row.status).toBe('unmapped');
    expect(row.access).toBe('unmapped');
  });

  it('does not use curriculum demo fields — only day state', () => {
    const completed = deriveArenaMissionProgress({
      missionKey: 'insertion-sort',
      topicKey: 'sorting',
      mapping: { dayId: 'day-1', isActive: true },
      day: { id: 'day-1', status: 'completed', codingSolved: 3 },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: 3,
      totalMcq: 5,
      attemptedMcq: 5,
    });
    expect(completed.status).toBe('completed');
    expect(completed.progress).toBe('completed');
    expect(completed.completedCoding).toBe(3);
    expect(completed.totalCoding).toBe(3);
  });

  it('maps in_progress day to in_progress mission', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'insertion-sort',
      topicKey: 'sorting',
      mapping: { dayId: 'day-1', isActive: true },
      day: { id: 'day-1', status: 'in_progress', codingSolved: 1 },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: 3,
      totalMcq: 5,
      attemptedMcq: 2,
    });
    expect(row.status).toBe('in_progress');
    expect(row.access).toBe('accessible');
  });

  it('maps available day to available / not_started', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'array-basics',
      topicKey: 'arrays',
      mapping: { dayId: 'day-a', isActive: true },
      day: { id: 'day-a', status: 'available', codingSolved: 0 },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });
    expect(row.status).toBe('available');
    expect(row.progress).toBe('not_started');
  });

  it('locks when week is locked', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'bubble-sort',
      topicKey: 'sorting',
      mapping: { dayId: 'day-s1', isActive: true },
      day: { id: 'day-s1', status: 'locked' },
      weekLocked: true,
      weekLockReason: 'Complete Week 3 first.',
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });
    expect(row.status).toBe('locked');
    expect(row.access).toBe('locked');
    expect(row.reason).toContain('Week 3');
  });

  it('locks when day progress is locked', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'selection-sort',
      topicKey: 'sorting',
      mapping: { dayId: 'day-s2', isActive: true },
      day: { id: 'day-s2', status: 'locked', lockReason: 'Complete Day 1 first.' },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });
    expect(row.status).toBe('locked');
    expect(row.reason).toContain('Day 1');
  });

  it('treats inactive mapping as unmapped', () => {
    const row = deriveArenaMissionProgress({
      missionKey: 'x',
      topicKey: 'arrays',
      mapping: { dayId: 'd', isActive: false },
      day: { id: 'd', status: 'available' },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });
    expect(row.status).toBe('unmapped');
  });
});

describe('deriveArenaTopicProgress', () => {
  const mk = (
    key: string,
    status: 'completed' | 'in_progress' | 'available' | 'locked' | 'unmapped',
  ) =>
    deriveArenaMissionProgress({
      missionKey: key,
      topicKey: 'sorting',
      mapping:
        status === 'unmapped' ? null : { dayId: `day-${key}`, isActive: true },
      day:
        status === 'unmapped' || status === 'locked'
          ? status === 'locked'
            ? { id: `day-${key}`, status: 'locked' }
            : null
          : {
              id: `day-${key}`,
              status:
                status === 'completed'
                  ? 'completed'
                  : status === 'in_progress'
                    ? 'in_progress'
                    : 'available',
            },
      weekLocked: false,
      weekLockReason: null,
      totalCoding: null,
      totalMcq: null,
      attemptedMcq: null,
    });

  it('is unmapped when no mapped missions', () => {
    const topic = deriveArenaTopicProgress('foundations', [mk('a', 'unmapped'), mk('b', 'unmapped')]);
    expect(topic.status).toBe('unmapped');
    expect(topic.mappedCompletionPercent).toBeNull();
  });

  it('is completed when all mapped missions completed', () => {
    const topic = deriveArenaTopicProgress('arrays', [
      mk('a', 'completed'),
      mk('b', 'completed'),
      mk('u', 'unmapped'),
    ]);
    expect(topic.status).toBe('completed');
    expect(topic.mappedMissionCount).toBe(2);
    expect(topic.completedMappedCount).toBe(2);
  });

  it('is in_progress when any mapped mission is in progress', () => {
    const topic = deriveArenaTopicProgress('sorting', [
      mk('a', 'completed'),
      mk('b', 'in_progress'),
      mk('c', 'locked'),
    ]);
    expect(topic.status).toBe('in_progress');
  });

  it('is available when a mapped mission is available and none in progress', () => {
    const topic = deriveArenaTopicProgress('sorting', [
      mk('a', 'completed'),
      mk('b', 'available'),
      mk('c', 'locked'),
    ]);
    expect(topic.status).toBe('available');
  });

  it('is locked when all mapped missions are locked', () => {
    const topic = deriveArenaTopicProgress('sorting', [mk('a', 'locked'), mk('b', 'locked')]);
    expect(topic.status).toBe('locked');
  });

  it('ignores curriculum demo XP — status only from mission rows', () => {
    const topic = deriveArenaTopicProgress('sorting', [mk('a', 'available')]);
    expect(topic.status).toBe('available');
    expect(topic).not.toHaveProperty('xp');
  });
});
