import { prisma } from '@/lib/prisma';
import { ensureDsaCurriculum } from '@/lib/dsa/ensure-curriculum';
import { getDsaDashboard } from '@/lib/dsa/service';
import { assertUserAssignedToDsa, isUserAssignedToDsa } from '@/lib/dsa/roster';
import { DSA_ARENA_TOPICS } from '@/lib/dsa-arena/curriculum';

/** Authoritative Arena mission presentation (derived from DSA day state). */
export type ArenaMissionAccess = 'accessible' | 'locked' | 'unmapped';

export type ArenaMissionProgressKind = 'not_started' | 'in_progress' | 'completed';

/** UI-facing mission status — never from curriculum.ts demo fields. */
export type ArenaLiveMissionStatus =
  | 'completed'
  | 'in_progress'
  | 'available'
  | 'locked'
  | 'unmapped';

export type ArenaLiveTopicStatus =
  | 'completed'
  | 'in_progress'
  | 'available'
  | 'locked'
  | 'unmapped';

export type ArenaMissionProgress = {
  missionKey: string;
  topicKey: string;
  mapped: boolean;
  dayId: string | null;
  href: `/dsa/day/${string}` | null;
  access: ArenaMissionAccess;
  progress: ArenaMissionProgressKind | null;
  status: ArenaLiveMissionStatus;
  reason: string | null;
  completedCoding: number | null;
  totalCoding: number | null;
  attemptedMcq: number | null;
  totalMcq: number | null;
};

export type ArenaTopicProgress = {
  topicKey: string;
  status: ArenaLiveTopicStatus;
  mappedMissionCount: number;
  completedMappedCount: number;
  /** Percent of mapped missions completed (0–100), null if no mapped missions. */
  mappedCompletionPercent: number | null;
};

export type ArenaProgressionSnapshot = {
  missions: Record<string, ArenaMissionProgress>;
  topics: Record<string, ArenaTopicProgress>;
  /** Prefer this mission for “continue” — first in_progress, else first available. */
  continueMissionKey: string | null;
  rosterAssigned: boolean;
};

type DashboardDay = {
  id: string;
  status: string;
  codingSolved?: number;
  lockReason?: string | null;
};

type DashboardWeek = {
  status: string;
  lockReason?: string;
  days: DashboardDay[];
};

/**
 * Derive a single mission's live status from mapping + DSA day row.
 * Pure — unit-tested; does not read curriculum demo status.
 */
export function deriveArenaMissionProgress(input: {
  missionKey: string;
  topicKey: string;
  mapping: { dayId: string; isActive: boolean } | null;
  /** Day row from student dashboard when week is unlocked; null if unknown/locked week. */
  day: DashboardDay | null;
  weekLocked: boolean;
  weekLockReason: string | null;
  totalCoding: number | null;
  totalMcq: number | null;
  attemptedMcq: number | null;
}): ArenaMissionProgress {
  const base = {
    missionKey: input.missionKey,
    topicKey: input.topicKey,
    completedCoding: null as number | null,
    totalCoding: input.totalCoding,
    attemptedMcq: input.attemptedMcq,
    totalMcq: input.totalMcq,
  };

  if (!input.mapping || !input.mapping.isActive) {
    return {
      ...base,
      mapped: false,
      dayId: null,
      href: null,
      access: 'unmapped',
      progress: null,
      status: 'unmapped',
      reason: 'Mission is not connected to a coding workspace yet.',
    };
  }

  const dayId = input.mapping.dayId;
  const href = `/dsa/day/${dayId}` as const;

  if (input.weekLocked) {
    return {
      ...base,
      mapped: true,
      dayId,
      href,
      access: 'locked',
      progress: null,
      status: 'locked',
      reason: input.weekLockReason ?? 'Complete the previous week before opening this mission.',
    };
  }

  if (!input.day) {
    return {
      ...base,
      mapped: true,
      dayId,
      href,
      access: 'locked',
      progress: null,
      status: 'locked',
      reason: 'Day progress is not available for this attempt.',
    };
  }

  const codingSolved =
    typeof input.day.codingSolved === 'number' ? input.day.codingSolved : null;

  if (input.day.status === 'locked') {
    return {
      ...base,
      mapped: true,
      dayId,
      href,
      access: 'locked',
      progress: null,
      status: 'locked',
      reason: input.day.lockReason ?? 'This DSA day is still locked.',
      completedCoding: codingSolved,
    };
  }

  if (input.day.status === 'completed') {
    return {
      ...base,
      mapped: true,
      dayId,
      href,
      access: 'accessible',
      progress: 'completed',
      status: 'completed',
      reason: null,
      completedCoding: codingSolved,
    };
  }

  if (input.day.status === 'in_progress') {
    return {
      ...base,
      mapped: true,
      dayId,
      href,
      access: 'accessible',
      progress: 'in_progress',
      status: 'in_progress',
      reason: null,
      completedCoding: codingSolved,
    };
  }

  // available (or other unlocked non-completed states)
  return {
    ...base,
    mapped: true,
    dayId,
    href,
    access: 'accessible',
    progress: 'not_started',
    status: 'available',
    reason: null,
    completedCoding: codingSolved,
  };
}

/**
 * Topic status from mapped missions only.
 *
 * Rules:
 * - 0 mapped → unmapped
 * - all mapped completed → completed
 * - any in_progress → in_progress
 * - any available (and none in_progress) → available
 * - otherwise all locked → locked
 */
export function deriveArenaTopicProgress(
  topicKey: string,
  missions: ArenaMissionProgress[],
): ArenaTopicProgress {
  const mapped = missions.filter((m) => m.mapped);
  if (!mapped.length) {
    return {
      topicKey,
      status: 'unmapped',
      mappedMissionCount: 0,
      completedMappedCount: 0,
      mappedCompletionPercent: null,
    };
  }

  const completedMappedCount = mapped.filter((m) => m.status === 'completed').length;
  const mappedCompletionPercent = Math.round((completedMappedCount / mapped.length) * 100);

  if (completedMappedCount === mapped.length) {
    return {
      topicKey,
      status: 'completed',
      mappedMissionCount: mapped.length,
      completedMappedCount,
      mappedCompletionPercent,
    };
  }
  if (mapped.some((m) => m.status === 'in_progress')) {
    return {
      topicKey,
      status: 'in_progress',
      mappedMissionCount: mapped.length,
      completedMappedCount,
      mappedCompletionPercent,
    };
  }
  if (mapped.some((m) => m.status === 'available')) {
    return {
      topicKey,
      status: 'available',
      mappedMissionCount: mapped.length,
      completedMappedCount,
      mappedCompletionPercent,
    };
  }
  return {
    topicKey,
    status: 'locked',
    mappedMissionCount: mapped.length,
    completedMappedCount,
    mappedCompletionPercent,
  };
}

function pickContinueMissionKey(missions: ArenaMissionProgress[]): string | null {
  const orderedKeys = DSA_ARENA_TOPICS.flatMap((t) => t.missions.map((m) => m.id));
  const byKey = new Map(missions.map((m) => [m.missionKey, m]));
  for (const key of orderedKeys) {
    const row = byKey.get(key);
    if (row?.status === 'in_progress') return key;
  }
  for (const key of orderedKeys) {
    const row = byKey.get(key);
    if (row?.status === 'available') return key;
  }
  return null;
}

/**
 * Batch load Arena progression for one student.
 *
 * Query strategy (no per-mission DB round-trips):
 * 1. ensure curriculum + mappings
 * 2. one dashboard load (existing week/day access + progress)
 * 3. one assignments aggregate for mapped day progress rows
 * 4. in-memory join curriculum ↔ mappings ↔ day state
 */
export async function getArenaProgressionForStudent(
  userId: string,
): Promise<ArenaProgressionSnapshot> {
  await ensureDsaCurriculum();

  const mappings = await prisma.dsaJourneyMission.findMany({
    where: { isActive: true },
    select: { missionKey: true, topicKey: true, dayId: true, isActive: true },
  });
  const mappingByKey = new Map(mappings.map((m) => [m.missionKey, m]));

  const { assigned } = await isUserAssignedToDsa(userId);

  const emptyMissions: ArenaMissionProgress[] = [];
  for (const topic of DSA_ARENA_TOPICS) {
    for (const mission of topic.missions) {
      emptyMissions.push(
        deriveArenaMissionProgress({
          missionKey: mission.id,
          topicKey: topic.id,
          mapping: mappingByKey.get(mission.id)
            ? {
                dayId: mappingByKey.get(mission.id)!.dayId,
                isActive: mappingByKey.get(mission.id)!.isActive,
              }
            : null,
          day: null,
          weekLocked: true,
          weekLockReason: assigned
            ? 'DSA progress is unavailable.'
            : 'DSA practice is not assigned to your roll number.',
          totalCoding: null,
          totalMcq: null,
          attemptedMcq: null,
        }),
      );
    }
  }

  if (!assigned) {
    const missionsRec: Record<string, ArenaMissionProgress> = {};
    for (const m of emptyMissions) {
      // Unmapped stay unmapped; mapped become locked (no roster).
      if (!m.mapped) {
        missionsRec[m.missionKey] = m;
      } else {
        missionsRec[m.missionKey] = {
          ...m,
          access: 'locked',
          status: 'locked',
          progress: null,
          reason: 'DSA practice is not assigned to your roll number.',
        };
      }
    }
    const topicsRec: Record<string, ArenaTopicProgress> = {};
    for (const topic of DSA_ARENA_TOPICS) {
      const list = topic.missions.map((m) => missionsRec[m.id]!).filter(Boolean);
      topicsRec[topic.id] = deriveArenaTopicProgress(topic.id, list);
    }
    return {
      missions: missionsRec,
      topics: topicsRec,
      continueMissionKey: null,
      rosterAssigned: false,
    };
  }

  // Reuse authoritative dashboard (week locks + day statuses). May create week attempts
  // the same way opening /dsa does — does not change completion rules.
  await assertUserAssignedToDsa(userId);
  const dashboard = (await getDsaDashboard(userId)) as {
    weeks?: DashboardWeek[];
    config?: { codingProblemsPerDay?: number; mcqsPerDay?: number };
  };

  const dayLookup = new Map<
    string,
    { day: DashboardDay; weekLocked: boolean; weekLockReason: string | null }
  >();
  for (const week of dashboard.weeks ?? []) {
    const weekLocked = week.status === 'locked';
    for (const day of week.days ?? []) {
      dayLookup.set(day.id, {
        day,
        weekLocked,
        weekLockReason: week.lockReason ?? null,
      });
    }
  }

  const mappedDayIds = [...new Set(mappings.map((m) => m.dayId))];
  const assignmentCounts = new Map<
    string,
    { totalCoding: number; totalMcq: number; attemptedMcq: number }
  >();

  if (mappedDayIds.length) {
    const progressRows = await prisma.dsaDayProgress.findMany({
      where: {
        dayId: { in: mappedDayIds },
        weekAttempt: {
          kind: 'official',
          isActive: true,
          enrollment: { userId },
        },
      },
      select: {
        dayId: true,
        assignments: { select: { kind: true, mcqId: true } },
      },
    });

    const mcqIds = [
      ...new Set(
        progressRows.flatMap((p) =>
          p.assignments.filter((a) => a.kind === 'mcq' && a.mcqId).map((a) => a.mcqId as string),
        ),
      ),
    ];
    const attemptedMcqIds = new Set<string>();
    if (mcqIds.length) {
      const mcqAttempts = await prisma.dsaMcqAttempt.findMany({
        where: { userId, mcqId: { in: mcqIds } },
        select: { mcqId: true },
        distinct: ['mcqId'],
      });
      for (const row of mcqAttempts) attemptedMcqIds.add(row.mcqId);
    }

    for (const row of progressRows) {
      const totalCoding = row.assignments.filter((a) => a.kind === 'coding').length;
      const mcqAssign = row.assignments.filter((a) => a.kind === 'mcq' && a.mcqId);
      const totalMcq = mcqAssign.length;
      const attemptedMcq = mcqAssign.filter((a) => attemptedMcqIds.has(a.mcqId!)).length;
      assignmentCounts.set(row.dayId, { totalCoding, totalMcq, attemptedMcq });
    }
  }

  const missionList: ArenaMissionProgress[] = [];
  for (const topic of DSA_ARENA_TOPICS) {
    for (const mission of topic.missions) {
      const mapping = mappingByKey.get(mission.id) ?? null;
      const looked = mapping ? dayLookup.get(mapping.dayId) : undefined;
      const counts = mapping ? assignmentCounts.get(mapping.dayId) : undefined;
      missionList.push(
        deriveArenaMissionProgress({
          missionKey: mission.id,
          topicKey: topic.id,
          mapping: mapping
            ? { dayId: mapping.dayId, isActive: mapping.isActive }
            : null,
          day: looked && !looked.weekLocked ? looked.day : looked?.day ?? null,
          weekLocked: looked ? looked.weekLocked : Boolean(mapping),
          weekLockReason: looked?.weekLockReason ?? null,
          totalCoding: counts && counts.totalCoding > 0 ? counts.totalCoding : null,
          totalMcq: counts && counts.totalMcq > 0 ? counts.totalMcq : null,
          attemptedMcq: counts ? counts.attemptedMcq : null,
        }),
      );
    }
  }

  // Fix: when mapped but day not in dashboard at all (shouldn't happen for Level-1), lock.
  for (let i = 0; i < missionList.length; i += 1) {
    const m = missionList[i]!;
    const mapping = mappingByKey.get(m.missionKey);
    if (mapping && !dayLookup.has(mapping.dayId) && m.mapped && m.status !== 'unmapped') {
      missionList[i] = {
        ...m,
        access: 'locked',
        status: 'locked',
        progress: null,
        reason: 'Mapped day is not part of your current DSA program view.',
      };
    }
  }

  const missionsRec: Record<string, ArenaMissionProgress> = {};
  for (const m of missionList) missionsRec[m.missionKey] = m;

  const topicsRec: Record<string, ArenaTopicProgress> = {};
  for (const topic of DSA_ARENA_TOPICS) {
    const list = topic.missions.map((m) => missionsRec[m.id]!).filter(Boolean);
    topicsRec[topic.id] = deriveArenaTopicProgress(topic.id, list);
  }

  return {
    missions: missionsRec,
    topics: topicsRec,
    continueMissionKey: pickContinueMissionKey(missionList),
    rosterAssigned: true,
  };
}
