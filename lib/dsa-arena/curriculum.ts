export type ArenaMissionStatus = 'completed' | 'current' | 'locked' | 'available';

export type ArenaTopicStatus = 'completed' | 'current' | 'locked' | 'available';

export type ArenaMissionConfig = {
  id: string;
  number: number;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  skills: string[];
  xp: number;
  status: ArenaMissionStatus;
  /** Optional hint to match GET /api/student/dsa/dashboard day by dayNumber within topic week */
  dayNumberHint?: number;
  /** When set, START MISSION goes directly here (existing Code Lab) */
  codeLabHref?: string | null;
};

export type ArenaBossConfig = {
  id: string;
  title: string;
  description: string;
  difficulty: 'Hard' | 'Boss';
  xp: number;
  status: ArenaMissionStatus;
  href?: string | null;
};

export type ArenaTopicConfig = {
  id: string;
  title: string;
  kingdomTitle: string;
  description: string;
  status: ArenaTopicStatus;
  progress: number;
  skills: string[];
  xpTotal: number;
  missionCount: number;
  completedMissions: number;
  /** Match dashboard week.topicSlug / topicName */
  topicSlug?: string;
  boss?: ArenaBossConfig;
  missions: ArenaMissionConfig[];
};

export type ArenaAchievementDemo = {
  id: string;
  title: string;
  icon: 'trophy' | 'bolt' | 'flame' | 'star';
  earned: boolean;
};

export type ArenaDemoProfile = {
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
  missionsCompleted: number;
  problemsSolved: number;
  arenaRank: number | null;
  /** Demo flag — values are frontend-only until persistence exists */
  demo: boolean;
};

/** Frontend curriculum for DSA Arena journey (no backend model yet). */
export const DSA_ARENA_TOPICS: ArenaTopicConfig[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    kingdomTitle: 'Foundations Outpost',
    description: 'Programming basics, input/output, and problem-solving habits.',
    status: 'completed',
    progress: 100,
    skills: ['Basics', 'I/O', 'Logic'],
    xpTotal: 400,
    missionCount: 2,
    completedMissions: 2,
    topicSlug: 'basics',
    missions: [
      {
        id: 'programming-basics',
        number: 1,
        title: 'Programming Basics',
        description: 'Warm up with variables, control flow, and reading input.',
        difficulty: 'Easy',
        skills: ['Basics', 'Logic'],
        xp: 100,
        status: 'completed',
        dayNumberHint: 1,
      },
      {
        id: 'problem-solving-warmup',
        number: 2,
        title: 'Problem Solving Warmup',
        description: 'Translate worded problems into clean code.',
        difficulty: 'Easy',
        skills: ['Basics', 'I/O'],
        xp: 100,
        status: 'completed',
        dayNumberHint: 2,
      },
    ],
  },
  {
    id: 'arrays',
    title: 'Arrays',
    kingdomTitle: 'Arrays Territory',
    description: 'Index, traverse, search, and solve classic array challenges.',
    status: 'completed',
    progress: 100,
    skills: ['Arrays', 'Traversal', 'Searching'],
    xpTotal: 800,
    missionCount: 4,
    completedMissions: 4,
    topicSlug: 'arrays',
    missions: [
      {
        id: 'array-basics',
        number: 1,
        title: 'Array Basics',
        description: 'Index access, length, and safe iteration.',
        difficulty: 'Easy',
        skills: ['Arrays'],
        xp: 100,
        status: 'completed',
        dayNumberHint: 1,
      },
      {
        id: 'array-traversal',
        number: 2,
        title: 'Traversal',
        description: 'Walk arrays left-to-right and track running state.',
        difficulty: 'Easy',
        skills: ['Arrays', 'Loops'],
        xp: 120,
        status: 'completed',
        dayNumberHint: 2,
      },
      {
        id: 'array-searching',
        number: 3,
        title: 'Searching',
        description: 'Find targets with linear scans and early exits.',
        difficulty: 'Easy',
        skills: ['Arrays', 'Searching'],
        xp: 120,
        status: 'completed',
        dayNumberHint: 3,
      },
      {
        id: 'array-problems',
        number: 4,
        title: 'Array Problems',
        description: 'Apply patterns to real interview-style array tasks.',
        difficulty: 'Medium',
        skills: ['Arrays', 'Patterns'],
        xp: 150,
        status: 'completed',
        dayNumberHint: 4,
      },
    ],
  },
  {
    id: 'strings',
    title: 'Strings',
    kingdomTitle: 'Strings Realm',
    description: 'Manipulate characters, patterns, and string algorithms.',
    status: 'completed',
    progress: 100,
    skills: ['Strings', 'Patterns'],
    xpTotal: 600,
    missionCount: 3,
    completedMissions: 3,
    topicSlug: 'strings',
    missions: [
      {
        id: 'string-basics',
        number: 1,
        title: 'String Basics',
        description: 'Indexing, length, and immutable string habits.',
        difficulty: 'Easy',
        skills: ['Strings'],
        xp: 100,
        status: 'completed',
      },
      {
        id: 'string-manipulation',
        number: 2,
        title: 'Manipulation',
        description: 'Build, reverse, and transform string data.',
        difficulty: 'Easy',
        skills: ['Strings', 'Loops'],
        xp: 120,
        status: 'completed',
      },
      {
        id: 'pattern-problems',
        number: 3,
        title: 'Pattern Problems',
        description: 'Spot and code common string patterns.',
        difficulty: 'Medium',
        skills: ['Strings', 'Patterns'],
        xp: 150,
        status: 'completed',
      },
    ],
  },
  {
    id: 'searching',
    title: 'Searching',
    kingdomTitle: 'Search Citadel',
    description: 'Linear and binary search as precision tools.',
    status: 'completed',
    progress: 100,
    skills: ['Searching', 'Binary Search'],
    xpTotal: 450,
    missionCount: 2,
    completedMissions: 2,
    topicSlug: 'searching',
    missions: [
      {
        id: 'linear-search',
        number: 1,
        title: 'Linear Search',
        description: 'Scan sequences when order is unknown.',
        difficulty: 'Easy',
        skills: ['Searching'],
        xp: 100,
        status: 'completed',
      },
      {
        id: 'binary-search',
        number: 2,
        title: 'Binary Search',
        description: 'Halve the search space on sorted data.',
        difficulty: 'Medium',
        skills: ['Binary Search', 'Arrays'],
        xp: 150,
        status: 'completed',
      },
    ],
  },
  {
    id: 'sorting',
    title: 'Sorting',
    kingdomTitle: 'Sorting Kingdom',
    description: 'Master the algorithms that put data in order.',
    status: 'current',
    progress: 80,
    skills: ['Arrays', 'Sorting', 'Loops', 'Algorithms'],
    xpTotal: 900,
    missionCount: 6,
    completedMissions: 2,
    topicSlug: 'sorting',
    missions: [
      {
        id: 'bubble-sort',
        number: 1,
        title: 'Bubble Sort',
        description: 'Swap adjacent pairs until the list settles.',
        difficulty: 'Easy',
        skills: ['Arrays', 'Sorting'],
        xp: 100,
        status: 'completed',
        dayNumberHint: 1,
      },
      {
        id: 'selection-sort',
        number: 2,
        title: 'Selection Sort',
        description: 'Select the next minimum and place it correctly.',
        difficulty: 'Easy',
        skills: ['Arrays', 'Sorting'],
        xp: 100,
        status: 'completed',
        dayNumberHint: 2,
      },
      {
        id: 'insertion-sort',
        number: 3,
        title: 'Insertion Sort',
        description: 'Learn how insertion sort builds a sorted sequence.',
        difficulty: 'Medium',
        skills: ['Arrays', 'Sorting', 'Loops'],
        xp: 150,
        status: 'current',
        dayNumberHint: 3,
      },
      {
        id: 'merge-sort',
        number: 4,
        title: 'Merge Sort',
        description: 'Divide, conquer, and merge sorted halves.',
        difficulty: 'Hard',
        skills: ['Sorting', 'Recursion'],
        xp: 200,
        status: 'locked',
        dayNumberHint: 4,
      },
      {
        id: 'quick-sort',
        number: 5,
        title: 'Quick Sort',
        description: 'Partition around a pivot for fast average sorting.',
        difficulty: 'Hard',
        skills: ['Sorting', 'Algorithms'],
        xp: 200,
        status: 'locked',
        dayNumberHint: 5,
      },
      {
        id: 'unmapped-preview',
        number: 6,
        title: 'Unmapped Journey Preview',
        description:
          'Preview-only mission with no Code Lab connection — used to verify fail-closed handoff.',
        difficulty: 'Easy',
        skills: ['Preview'],
        xp: 0,
        status: 'available',
        // Intentionally no codeLabHref / dayNumberHint — must stay on Mission Brief.
      },
    ],
    boss: {
      id: 'sort-10000',
      title: 'Sort 10,000 Elements',
      description: 'Prove your sorting mastery under pressure.',
      difficulty: 'Hard',
      xp: 500,
      status: 'locked',
    },
  },
  {
    id: 'linked-list',
    title: 'Linked List',
    kingdomTitle: 'Linked List Depths',
    description: 'Pointer discipline and sequential structures.',
    status: 'locked',
    progress: 0,
    skills: ['Pointers', 'Lists'],
    xpTotal: 700,
    missionCount: 3,
    completedMissions: 0,
    topicSlug: 'linked-lists',
    missions: [
      {
        id: 'll-basics',
        number: 1,
        title: 'List Basics',
        description: 'Nodes, next pointers, and traversal.',
        difficulty: 'Medium',
        skills: ['Lists'],
        xp: 150,
        status: 'locked',
      },
      {
        id: 'll-insert-delete',
        number: 2,
        title: 'Insert & Delete',
        description: 'Mutate lists without breaking links.',
        difficulty: 'Medium',
        skills: ['Lists', 'Pointers'],
        xp: 180,
        status: 'locked',
      },
      {
        id: 'll-problems',
        number: 3,
        title: 'List Challenges',
        description: 'Reverse, cycle detect, and merge lists.',
        difficulty: 'Hard',
        skills: ['Lists'],
        xp: 220,
        status: 'locked',
      },
    ],
  },
  {
    id: 'stack-queue',
    title: 'Stack & Queue',
    kingdomTitle: 'Stack & Queue Forge',
    description: 'LIFO and FIFO patterns for real problems.',
    status: 'locked',
    progress: 0,
    skills: ['Stacks', 'Queues'],
    xpTotal: 650,
    missionCount: 3,
    completedMissions: 0,
    missions: [
      {
        id: 'stack-basics',
        number: 1,
        title: 'Stack Basics',
        description: 'Push, pop, and peek with confidence.',
        difficulty: 'Easy',
        skills: ['Stacks'],
        xp: 120,
        status: 'locked',
      },
      {
        id: 'queue-basics',
        number: 2,
        title: 'Queue Basics',
        description: 'Enqueue and dequeue for ordered processing.',
        difficulty: 'Easy',
        skills: ['Queues'],
        xp: 120,
        status: 'locked',
      },
      {
        id: 'stack-queue-problems',
        number: 3,
        title: 'Forge Challenges',
        description: 'Apply stacks and queues to classic puzzles.',
        difficulty: 'Medium',
        skills: ['Stacks', 'Queues'],
        xp: 180,
        status: 'locked',
      },
    ],
  },
  {
    id: 'recursion',
    title: 'Recursion',
    kingdomTitle: 'Recursion Spire',
    description: 'Think in base cases and recursive leaps.',
    status: 'locked',
    progress: 0,
    skills: ['Recursion'],
    xpTotal: 700,
    missionCount: 3,
    completedMissions: 0,
    missions: [
      {
        id: 'recursion-basics',
        number: 1,
        title: 'Recursion Basics',
        description: 'Base case, recursive case, call stack.',
        difficulty: 'Medium',
        skills: ['Recursion'],
        xp: 150,
        status: 'locked',
      },
      {
        id: 'recursion-patterns',
        number: 2,
        title: 'Recursion Patterns',
        description: 'Divide problems into smaller copies.',
        difficulty: 'Medium',
        skills: ['Recursion'],
        xp: 180,
        status: 'locked',
      },
      {
        id: 'recursion-challenges',
        number: 3,
        title: 'Spire Challenges',
        description: 'Backtracking and recursive search.',
        difficulty: 'Hard',
        skills: ['Recursion'],
        xp: 220,
        status: 'locked',
      },
    ],
  },
  {
    id: 'trees',
    title: 'Trees',
    kingdomTitle: 'Tree Canopy',
    description: 'Binary trees, traversals, and hierarchical data.',
    status: 'locked',
    progress: 0,
    skills: ['Trees', 'DFS', 'BFS'],
    xpTotal: 900,
    missionCount: 4,
    completedMissions: 0,
    missions: [
      {
        id: 'tree-basics',
        number: 1,
        title: 'Tree Basics',
        description: 'Nodes, children, and root thinking.',
        difficulty: 'Medium',
        skills: ['Trees'],
        xp: 150,
        status: 'locked',
      },
      {
        id: 'tree-traversal',
        number: 2,
        title: 'Traversals',
        description: 'Inorder, preorder, postorder, level order.',
        difficulty: 'Medium',
        skills: ['Trees', 'DFS'],
        xp: 180,
        status: 'locked',
      },
      {
        id: 'bst',
        number: 3,
        title: 'Binary Search Trees',
        description: 'Ordered trees for fast lookup.',
        difficulty: 'Hard',
        skills: ['Trees', 'BST'],
        xp: 220,
        status: 'locked',
      },
      {
        id: 'tree-problems',
        number: 4,
        title: 'Canopy Challenges',
        description: 'Depth, diameter, and path problems.',
        difficulty: 'Hard',
        skills: ['Trees'],
        xp: 250,
        status: 'locked',
      },
    ],
  },
  {
    id: 'heaps',
    title: 'Heaps',
    kingdomTitle: 'Heap Highlands',
    description: 'Priority queues and heap-ordered structures.',
    status: 'locked',
    progress: 0,
    skills: ['Heaps', 'Priority Queue'],
    xpTotal: 600,
    missionCount: 2,
    completedMissions: 0,
    missions: [
      {
        id: 'heap-basics',
        number: 1,
        title: 'Heap Basics',
        description: 'Sift up, sift down, and heap property.',
        difficulty: 'Medium',
        skills: ['Heaps'],
        xp: 180,
        status: 'locked',
      },
      {
        id: 'heap-problems',
        number: 2,
        title: 'Highland Challenges',
        description: 'Top-K and priority scheduling patterns.',
        difficulty: 'Hard',
        skills: ['Heaps'],
        xp: 220,
        status: 'locked',
      },
    ],
  },
  {
    id: 'graphs',
    title: 'Graphs',
    kingdomTitle: 'Graph Frontier',
    description: 'Connectivity, BFS/DFS, and pathfinding.',
    status: 'locked',
    progress: 0,
    skills: ['Graphs', 'BFS', 'DFS'],
    xpTotal: 1000,
    missionCount: 3,
    completedMissions: 0,
    missions: [
      {
        id: 'graph-basics',
        number: 1,
        title: 'Graph Basics',
        description: 'Adjacency lists and graph vocabulary.',
        difficulty: 'Medium',
        skills: ['Graphs'],
        xp: 180,
        status: 'locked',
      },
      {
        id: 'graph-traversal',
        number: 2,
        title: 'Graph Traversal',
        description: 'BFS and DFS across connected worlds.',
        difficulty: 'Hard',
        skills: ['Graphs', 'BFS'],
        xp: 220,
        status: 'locked',
      },
      {
        id: 'graph-problems',
        number: 3,
        title: 'Frontier Challenges',
        description: 'Shortest paths and connectivity quests.',
        difficulty: 'Hard',
        skills: ['Graphs'],
        xp: 280,
        status: 'locked',
      },
    ],
  },
  {
    id: 'dynamic-programming',
    title: 'Dynamic Programming',
    kingdomTitle: 'DP Citadel',
    description: 'Optimal substructure and memoized mastery.',
    status: 'locked',
    progress: 0,
    skills: ['DP', 'Memoization'],
    xpTotal: 1200,
    missionCount: 3,
    completedMissions: 0,
    missions: [
      {
        id: 'dp-basics',
        number: 1,
        title: 'DP Basics',
        description: 'Overlapping subproblems and tables.',
        difficulty: 'Hard',
        skills: ['DP'],
        xp: 220,
        status: 'locked',
      },
      {
        id: 'dp-patterns',
        number: 2,
        title: 'DP Patterns',
        description: 'Knapsack, LIS, and path DP patterns.',
        difficulty: 'Hard',
        skills: ['DP'],
        xp: 280,
        status: 'locked',
      },
      {
        id: 'dp-challenges',
        number: 3,
        title: 'Citadel Challenges',
        description: 'Compose DP solutions under constraints.',
        difficulty: 'Hard',
        skills: ['DP'],
        xp: 320,
        status: 'locked',
      },
    ],
  },
  {
    id: 'dsa-master',
    title: 'DSA Master',
    kingdomTitle: 'Final Boss — DSA Master',
    description: 'Capstone proving you can combine every skill.',
    status: 'locked',
    progress: 0,
    skills: ['Mastery'],
    xpTotal: 2000,
    missionCount: 1,
    completedMissions: 0,
    missions: [
      {
        id: 'final-gauntlet',
        number: 1,
        title: 'Final Gauntlet',
        description: 'A multi-skill gauntlet across the full journey.',
        difficulty: 'Hard',
        skills: ['Mastery'],
        xp: 500,
        status: 'locked',
      },
    ],
    boss: {
      id: 'dsa-master-boss',
      title: 'DSA Master Trial',
      description: 'Survive the final assessment of the Arena.',
      difficulty: 'Boss',
      xp: 1000,
      status: 'locked',
    },
  },
];

export const DSA_ARENA_DEMO_PROFILE: ArenaDemoProfile = {
  level: 12,
  xp: 4850,
  xpToNext: 6000,
  streak: 7,
  missionsCompleted: 24,
  problemsSolved: 58,
  arenaRank: 42,
  demo: true,
};

export const DSA_ARENA_ACHIEVEMENTS: ArenaAchievementDemo[] = [
  { id: 'array-explorer', title: 'Array Explorer', icon: 'trophy', earned: true },
  { id: 'fast-solver', title: 'Fast Solver', icon: 'bolt', earned: true },
  { id: 'streak-7', title: '7 Day Streak', icon: 'flame', earned: true },
  { id: 'sort-initiate', title: 'Sort Initiate', icon: 'star', earned: false },
];

export function getTopicById(topicId: string): ArenaTopicConfig | undefined {
  return DSA_ARENA_TOPICS.find((t) => t.id === topicId);
}

export function getMissionByIds(
  topicId: string,
  missionId: string,
): { topic: ArenaTopicConfig; mission: ArenaMissionConfig } | null {
  const topic = getTopicById(topicId);
  if (!topic) return null;
  const mission = topic.missions.find((m) => m.id === missionId);
  if (!mission) return null;
  return { topic, mission };
}

export function getCurrentMission(): {
  topic: ArenaTopicConfig;
  mission: ArenaMissionConfig;
} | null {
  for (const topic of DSA_ARENA_TOPICS) {
    const mission = topic.missions.find((m) => m.status === 'current');
    if (mission) return { topic, mission };
  }
  return null;
}
