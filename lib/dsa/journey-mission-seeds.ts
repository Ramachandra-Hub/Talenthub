/**
 * Explicit Arena mission_key → (week topic_slug, day_number) seeds.
 *
 * day_id is resolved at ensure time from real dsa_weeks/dsa_days rows.
 * Do NOT invent UUIDs. Do NOT derive mappings from title/fuzzy/heuristics at resolve time.
 *
 * Only missions with a verified DSA Level-1 week+day are listed.
 * Intentionally omitted: unmapped-preview, foundations/*, strings/*, searching/*,
 * and locked future Arena topics without backend weeks.
 */
export type JourneyMissionSeed = {
  missionKey: string;
  topicKey: string;
  /** Existing dsa_weeks.topic_slug used to locate the authoritative week */
  weekTopicSlug: string;
  /** Existing dsa_days.day_number within that week */
  dayNumber: number;
  focusProblemSlug?: string | null;
  sortOrder: number;
  isActive?: boolean;
};

export const DSA_JOURNEY_MISSION_SEEDS: JourneyMissionSeed[] = [
  // Arrays week (week 1)
  {
    missionKey: 'array-basics',
    topicKey: 'arrays',
    weekTopicSlug: 'arrays',
    dayNumber: 1,
    sortOrder: 10,
  },
  {
    missionKey: 'array-traversal',
    topicKey: 'arrays',
    weekTopicSlug: 'arrays',
    dayNumber: 2,
    sortOrder: 20,
  },
  {
    missionKey: 'array-searching',
    topicKey: 'arrays',
    weekTopicSlug: 'arrays',
    dayNumber: 3,
    sortOrder: 30,
  },
  {
    missionKey: 'array-problems',
    topicKey: 'arrays',
    weekTopicSlug: 'arrays',
    dayNumber: 4,
    sortOrder: 40,
  },

  // Sorting week (week 4)
  {
    missionKey: 'bubble-sort',
    topicKey: 'sorting',
    weekTopicSlug: 'sorting',
    dayNumber: 1,
    sortOrder: 50,
  },
  {
    missionKey: 'selection-sort',
    topicKey: 'sorting',
    weekTopicSlug: 'sorting',
    dayNumber: 2,
    sortOrder: 60,
  },
  {
    missionKey: 'insertion-sort',
    topicKey: 'sorting',
    weekTopicSlug: 'sorting',
    dayNumber: 3,
    sortOrder: 70,
  },
  {
    missionKey: 'merge-sort',
    topicKey: 'sorting',
    weekTopicSlug: 'sorting',
    dayNumber: 4,
    sortOrder: 80,
  },
  {
    missionKey: 'quick-sort',
    topicKey: 'sorting',
    weekTopicSlug: 'sorting',
    dayNumber: 5,
    sortOrder: 90,
  },
];

/** Mission keys that must remain unmapped in Phase 1 (fail-closed). */
export const DSA_JOURNEY_INTENTIONALLY_UNMAPPED = [
  'unmapped-preview',
  'programming-basics',
  'problem-solving-warmup',
  'string-basics',
  'string-manipulation',
  'pattern-problems',
  'linear-search',
  'binary-search',
] as const;
