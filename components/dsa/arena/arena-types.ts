export type ArenaZoneStatus = 'completed' | 'current' | 'locked' | 'boss';

export type ArenaZone = {
  id: string;
  title: string;
  shortLabel: string;
  status: ArenaZoneStatus;
  weekId?: string;
  weekNumber?: number;
  topicSlug?: string;
  progressPercent: number;
  lockReason: string | null;
  /** First playable day / assessment entry for this zone */
  entryHref: string | null;
  /** Position on map as % of container */
  x: number;
  y: number;
};

export type ArenaMissionType =
  | 'learn'
  | 'brain_candy'
  | 'code'
  | 'challenge'
  | 'boss';

export type ArenaMissionStatus = 'completed' | 'available' | 'locked' | 'in_progress';

export type ArenaMission = {
  id: string;
  type: ArenaMissionType;
  title: string;
  description: string;
  status: ArenaMissionStatus;
  href: string | null;
  xp: number;
  coins: number;
  progressLabel?: string;
  lockReason?: string | null;
  dayNumber?: number;
};

export type ArenaAchievement = {
  id: string;
  title: string;
  description: string;
  tone: 'green' | 'blue' | 'orange' | 'purple';
  unlocked: boolean;
};

export type ArenaDashboardModel = {
  studentName: string;
  rollNumber: string;
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
  coins: number;
  badges: number;
  zones: ArenaZone[];
  currentZoneId: string;
  currentWeekTitle: string;
  currentTopicName: string;
  weekProgressPercent: number;
  daysCompleted: number;
  daysTotal: number;
  missions: ArenaMission[];
  dailyQuest: {
    title: string;
    progress: number;
    total: number;
    xpReward: number;
    coinsReward: number;
  };
  achievements: ArenaAchievement[];
  quote: string;
};
