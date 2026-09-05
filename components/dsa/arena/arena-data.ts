import type {
  ArenaAchievement,
  ArenaDashboardModel,
  ArenaMission,
  ArenaZone,
  ArenaZoneStatus,
} from '@/components/dsa/arena/arena-types';

type ApiDay = {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
  stars?: number;
  lockReason: string | null;
};

type ApiWeek = {
  id: string;
  weekNumber: number;
  title: string;
  topicName: string;
  topicSlug?: string;
  status: string;
  progressPercent: number;
  daysCompleted: number;
  daysTotal: number;
  currentDay: number | null;
  lockReason?: string;
  days: ApiDay[];
};

type ApiDashboard = {
  level?: { title: string };
  currentWeek?: ApiWeek;
  weeks?: ApiWeek[];
};

export type { ApiDashboard };

type HubStudent = {
  name?: string;
  rollNumber?: string;
};

/** Canonical adventure world — future zones stay locked until curriculum expands. */
const WORLD_BLUEPRINT: Array<{
  id: string;
  title: string;
  shortLabel: string;
  topicSlug?: string;
  x: number;
  y: number;
  boss?: boolean;
}> = [
  { id: 'basics', title: 'Basics', shortLabel: 'BASICS', x: 12, y: 72 },
  { id: 'arrays', title: 'Arrays', shortLabel: 'ARRAYS', topicSlug: 'arrays', x: 28, y: 48 },
  { id: 'strings', title: 'Strings', shortLabel: 'STRINGS', topicSlug: 'strings', x: 46, y: 62 },
  { id: 'sorting', title: 'Sorting', shortLabel: 'SORTING', topicSlug: 'sorting', x: 58, y: 38 },
  { id: 'searching', title: 'Searching', shortLabel: 'SEARCH', topicSlug: 'searching', x: 72, y: 55 },
  { id: 'linked-lists', title: 'Linked Lists', shortLabel: 'LISTS', x: 78, y: 28 },
  { id: 'stacks-queues', title: 'Stacks & Queues', shortLabel: 'STACK', x: 88, y: 48 },
  { id: 'trees', title: 'Trees', shortLabel: 'TREES', x: 84, y: 72 },
  { id: 'graphs', title: 'Graphs', shortLabel: 'GRAPH', x: 68, y: 82 },
  { id: 'dsa-master', title: 'DSA Master', shortLabel: 'MASTER', x: 92, y: 18, boss: true },
];

function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveGamification(input: {
  rollNumber: string;
  weeks: ApiWeek[];
}): { level: number; xp: number; xpToNext: number; streak: number; coins: number; badges: number } {
  const completedDays = input.weeks.reduce(
    (sum, w) => sum + w.days.filter((d) => d.status === 'completed').length,
    0,
  );
  const completedWeeks = input.weeks.filter((w) => w.status === 'completed').length;
  const stars = input.weeks.reduce(
    (sum, w) => sum + w.days.reduce((s, d) => s + (d.stars ?? 0), 0),
    0,
  );
  const xp = completedDays * 120 + completedWeeks * 250 + stars * 40;
  const level = Math.max(1, Math.floor(xp / 800) + 1);
  const xpIntoLevel = xp % 800;
  const seed = hashSeed(input.rollNumber || 'student');
  return {
    level,
    xp: xpIntoLevel,
    xpToNext: 800,
    streak: Math.min(30, completedDays + (seed % 4)),
    coins: 80 + completedDays * 35 + stars * 10,
    badges: Math.min(24, 2 + completedDays + completedWeeks * 2),
  };
}

function weekStatusToZone(week: ApiWeek | undefined, isBoss: boolean): ArenaZoneStatus {
  if (isBoss) return 'boss';
  if (!week) return 'locked';
  if (week.status === 'completed') return 'completed';
  if (week.status === 'locked') return 'locked';
  return 'current';
}

function buildMissions(week: ApiWeek | undefined): ArenaMission[] {
  if (!week || week.status === 'locked') {
    return [
      {
        id: 'locked-week',
        type: 'learn',
        title: 'Zone locked',
        description: week?.lockReason ?? 'Complete the previous zone to enter this territory.',
        status: 'locked',
        href: null,
        xp: 0,
        coins: 0,
        lockReason: week?.lockReason ?? 'Zone locked',
      },
    ];
  }

  const missions: ArenaMission[] = [
    {
      id: `learn-${week.id}`,
      type: 'learn',
      title: `What are ${week.topicName}?`,
      description: `Understand the building blocks of ${week.topicName.toLowerCase()} with clear intuition.`,
      status: week.daysCompleted > 0 ? 'completed' : 'available',
      href: week.days.find((d) => d.status !== 'locked')?.id
        ? `/dsa/day/${week.days.find((d) => d.status !== 'locked')!.id}`
        : null,
      xp: 30,
      coins: 5,
      progressLabel: week.daysCompleted > 0 ? 'Completed' : undefined,
    },
  ];

  for (const day of week.days) {
    const isLocked = day.status === 'locked';
    const isDone = day.status === 'completed';
    const isActive = day.status === 'available' || day.status === 'in_progress';
    const type: ArenaMission['type'] =
      day.dayNumber >= week.days.length
        ? 'challenge'
        : day.dayNumber % 2 === 0
          ? 'brain_candy'
          : 'code';

    missions.push({
      id: day.id,
      type,
      title:
        type === 'brain_candy'
          ? `Brain Candy · Day ${day.dayNumber}`
          : type === 'challenge'
            ? `Challenge · Day ${day.dayNumber}`
            : `Code Mission · Day ${day.dayNumber}`,
      description:
        type === 'brain_candy'
          ? '5 MCQs to sharpen concepts before you code.'
          : type === 'challenge'
            ? 'Harder problem set. Earn more XP and prove the zone.'
            : `Solve ${week.topicName.toLowerCase()} coding problems for Day ${day.dayNumber}.`,
      status: isDone ? 'completed' : isLocked ? 'locked' : isActive ? 'available' : 'locked',
      href: isLocked ? null : `/dsa/day/${day.id}`,
      xp: type === 'challenge' ? 100 : type === 'brain_candy' ? 40 : 50 + day.dayNumber * 10,
      coins: type === 'challenge' ? 20 : 10 + day.dayNumber * 2,
      progressLabel: isDone
        ? 'Completed'
        : isActive
          ? day.status === 'in_progress'
            ? 'In progress'
            : 'Ready'
          : undefined,
      lockReason: day.lockReason,
      dayNumber: day.dayNumber,
    });
  }

  if (week.daysCompleted >= week.daysTotal && week.daysTotal > 0) {
    missions.push({
      id: `boss-${week.id}`,
      type: 'boss',
      title: 'Weekly Boss Battle',
      description: 'Pass the weekly assessment to qualify for assignment attendance.',
      status: week.status === 'completed' ? 'completed' : 'available',
      href: `/dsa/week/${week.id}/assessment`,
      xp: 200,
      coins: 40,
      progressLabel: week.status === 'completed' ? 'Defeated' : 'Challenge',
    });
  }

  return missions;
}

function buildAchievements(weeks: ApiWeek[]): ArenaAchievement[] {
  const anyDay = weeks.some((w) => w.days.some((d) => d.status === 'completed'));
  const arrayWeek = weeks.find((w) => w.topicSlug === 'arrays' || w.topicName.toLowerCase().includes('array'));
  const arrayDays = arrayWeek?.days.filter((d) => d.status === 'completed').length ?? 0;
  const streakProxy = weeks.reduce((s, w) => s + w.daysCompleted, 0);

  return [
    {
      id: 'first-step',
      title: 'First Step',
      description: 'Completed your first mission',
      tone: 'green',
      unlocked: anyDay,
    },
    {
      id: 'array-novice',
      title: 'Array Novice',
      description: 'Solved 5 array day missions',
      tone: 'blue',
      unlocked: arrayDays >= 5,
    },
    {
      id: 'streak-master',
      title: 'Streak Master',
      description: '7 day coding streak',
      tone: 'orange',
      unlocked: streakProxy >= 7,
    },
    {
      id: 'week-cleared',
      title: 'Zone Cleared',
      description: 'Completed an official DSA week',
      tone: 'purple',
      unlocked: weeks.some((w) => w.status === 'completed'),
    },
  ];
}

export function adaptDsaDashboardToArena(input: {
  dashboard: ApiDashboard;
  student?: HubStudent | null;
}): ArenaDashboardModel {
  const weeks = input.dashboard.weeks ?? [];
  const currentWeek =
    input.dashboard.currentWeek ??
    weeks.find((w) => w.status === 'in_progress') ??
    weeks[0];

  const byTopic = new Map(weeks.map((w) => [w.topicSlug ?? w.topicName.toLowerCase(), w]));

  const zones: ArenaZone[] = WORLD_BLUEPRINT.map((bp) => {
    if (bp.id === 'basics') {
      const started = weeks.some((w) => w.daysCompleted > 0 || w.status !== 'locked');
      return {
        id: bp.id,
        title: bp.title,
        shortLabel: bp.shortLabel,
        status: started ? 'completed' : 'current',
        progressPercent: started ? 100 : 0,
        lockReason: null,
        entryHref: null,
        x: bp.x,
        y: bp.y,
      };
    }

    if (bp.boss) {
      const allDone = weeks.length > 0 && weeks.every((w) => w.status === 'completed');
      return {
        id: bp.id,
        title: bp.title,
        shortLabel: bp.shortLabel,
        status: allDone ? 'current' : 'boss',
        progressPercent: allDone ? 100 : 0,
        lockReason: allDone ? null : 'Complete all required DSA zones to challenge DSA Master.',
        entryHref: null,
        x: bp.x,
        y: bp.y,
      };
    }

    const week = bp.topicSlug ? byTopic.get(bp.topicSlug) : undefined;
    if (!week) {
      return {
        id: bp.id,
        title: bp.title,
        shortLabel: bp.shortLabel,
        status: 'locked',
        progressPercent: 0,
        lockReason: 'This territory unlocks in a future season of the Arena.',
        entryHref: null,
        x: bp.x,
        y: bp.y,
      };
    }

    const status = weekStatusToZone(week, false);
    const entryDay =
      week.days.find((d) => d.status === 'in_progress' || d.status === 'available') ??
      week.days.find((d) => d.status === 'completed') ??
      week.days[0];
    return {
      id: bp.id,
      title: bp.title,
      shortLabel: bp.shortLabel,
      status,
      weekId: week.id,
      weekNumber: week.weekNumber,
      topicSlug: week.topicSlug,
      progressPercent: week.progressPercent,
      lockReason:
        week.lockReason ??
        (status === 'locked' ? `Complete previous zone to unlock ${week.topicName}.` : null),
      entryHref: status === 'locked' || !entryDay ? null : `/dsa/day/${entryDay.id}`,
      x: bp.x,
      y: bp.y,
    };
  });

  // Ensure only one "current" zone among curriculum zones
  const currentCurriculum = zones.find((z) => z.status === 'current' && z.weekId);
  const currentZoneId =
    currentCurriculum?.id ??
    zones.find((z) => z.status === 'current')?.id ??
    zones.find((z) => z.status === 'completed')?.id ??
    'arrays';

  const gamification = deriveGamification({
    rollNumber: input.student?.rollNumber ?? '',
    weeks,
  });

  const completedInWeek = currentWeek?.days.filter((d) => d.status === 'completed').length ?? 0;

  return {
    studentName: input.student?.name?.trim() || 'Student',
    rollNumber: input.student?.rollNumber ?? '',
    ...gamification,
    zones,
    currentZoneId,
    currentWeekTitle: currentWeek?.title ?? 'Week 1',
    currentTopicName: currentWeek?.topicName ?? 'Arrays',
    weekProgressPercent: currentWeek?.progressPercent ?? 0,
    daysCompleted: currentWeek?.daysCompleted ?? 0,
    daysTotal: currentWeek?.daysTotal ?? 5,
    missions: buildMissions(currentWeek),
    dailyQuest: {
      title: `Complete 2 ${currentWeek?.topicName?.toLowerCase() ?? 'array'} missions`,
      progress: Math.min(2, completedInWeek),
      total: 2,
      xpReward: 100,
      coinsReward: 20,
    },
    achievements: buildAchievements(weeks),
    quote: 'Discipline today.\nDream job tomorrow.',
  };
}
