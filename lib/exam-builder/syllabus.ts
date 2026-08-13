/** Syllabus units grouped by test type — slugs must match question_tags.slug in the DB. */

export type SyllabusUnit = { slug: string; name: string };

/** Core RMSET sections (migration 015_rmset.sql). */
export const RMSET_CORE_UNITS: SyllabusUnit[] = [
  { slug: 'quantitative-aptitude', name: 'Quantitative Aptitude' },
  { slug: 'logical-reasoning', name: 'Logical Reasoning' },
  { slug: 'verbal-ability', name: 'Verbal Ability' },
  { slug: 'english-grammar', name: 'English Grammar' },
  { slug: 'computer-science', name: 'Computer Science' },
  { slug: 'dsa', name: 'Data Structures & Algorithms' },
  { slug: 'dbms', name: 'Database Management' },
  { slug: 'operating-systems', name: 'Operating Systems' },
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'mechanical', name: 'Mechanical Engineering' },
];

const BASE_GROUPS = {
  aptitude: [
    { slug: 'aptitude-percentages', name: 'Percentages' },
    { slug: 'aptitude-profit-loss', name: 'Profit & Loss' },
    { slug: 'aptitude-time-work', name: 'Time & Work' },
    { slug: 'aptitude-speed-distance', name: 'Time, Speed & Distance' },
    { slug: 'aptitude-ratio-proportion', name: 'Ratio & Proportion' },
    { slug: 'aptitude-number-systems', name: 'Number Systems' },
    { slug: 'aptitude-interest', name: 'Simple & Compound Interest' },
    { slug: 'aptitude-averages', name: 'Averages' },
    { slug: 'aptitude-pnc', name: 'Permutations & Combinations' },
    { slug: 'aptitude-probability', name: 'Probability' },
    { slug: 'aptitude-mixtures', name: 'Mixtures & Allegations' },
    { slug: 'aptitude-partnership', name: 'Partnership' },
  ],
  logical: [
    { slug: 'logical-deduction', name: 'Logical Deduction' },
    { slug: 'logical-seating', name: 'Seating Arrangement' },
    { slug: 'logical-blood-relations', name: 'Blood Relations' },
    { slug: 'logical-syllogisms', name: 'Syllogisms' },
    { slug: 'logical-data-interpretation', name: 'Data Interpretation' },
    { slug: 'logical-reasoning', name: 'Logical Reasoning (general)' },
  ],
  technical: [
    { slug: 'technical-c-language', name: 'C Language' },
    { slug: 'technical-programming', name: 'Programming' },
    { slug: 'technical-dbms', name: 'DBMS' },
    { slug: 'technical-os', name: 'Operating Systems' },
    { slug: 'technical-networks', name: 'Computer Networks' },
    { slug: 'dsa', name: 'Data Structures & Algorithms' },
    { slug: 'dbms', name: 'Database Management' },
    { slug: 'operating-systems', name: 'OS Fundamentals' },
    { slug: 'computer-science', name: 'Computer Science (general)' },
  ],
  verbal: [
    { slug: 'verbal-rc', name: 'Reading Comprehension' },
    { slug: 'verbal-vocabulary', name: 'Synonyms & Antonyms' },
    { slug: 'verbal-grammar', name: 'Sentence Correction' },
    { slug: 'english-grammar', name: 'English Grammar' },
    { slug: 'verbal-ability', name: 'Verbal Ability (general)' },
  ],
  ai: [
    { slug: 'ai-search-algorithms', name: 'Search Algorithms (BFS, DFS, A*)' },
    { slug: 'ai-knowledge-representation', name: 'Knowledge Representation' },
    { slug: 'ai-expert-systems', name: 'Expert Systems' },
    { slug: 'ai-propositional-logic', name: 'Propositional Logic' },
    { slug: 'ai-nlp-basics', name: 'NLP Basics' },
    { slug: 'ai-neural-networks-intro', name: 'Neural Networks (Intro)' },
    { slug: 'ai-game-theory', name: 'Game Theory & Minimax' },
    { slug: 'ai-planning', name: 'Automated Planning' },
  ],
  ml: [
    { slug: 'ml-linear-regression', name: 'Linear Regression' },
    { slug: 'ml-logistic-regression', name: 'Logistic Regression' },
    { slug: 'ml-decision-trees', name: 'Decision Trees' },
    { slug: 'ml-random-forest', name: 'Random Forest' },
    { slug: 'ml-svm', name: 'Support Vector Machines (SVM)' },
    { slug: 'ml-knn', name: 'K-Nearest Neighbors (KNN)' },
    { slug: 'ml-kmeans', name: 'K-Means Clustering' },
    { slug: 'ml-naive-bayes', name: 'Naive Bayes' },
    { slug: 'ml-neural-networks', name: 'Neural Networks' },
    { slug: 'ml-gradient-descent', name: 'Gradient Descent' },
    { slug: 'ml-backpropagation', name: 'Backpropagation' },
    { slug: 'ml-pca', name: 'PCA & Dimensionality Reduction' },
  ],
} as const satisfies Record<string, SyllabusUnit[]>;

/** RMSET = all placement syllabus units + core eligibility sections (deduped by slug). */
function buildRmsetUnits(): SyllabusUnit[] {
  const map = new Map<string, SyllabusUnit>();
  for (const units of Object.values(BASE_GROUPS)) {
    for (const u of units) map.set(u.slug, u);
  }
  for (const u of RMSET_CORE_UNITS) map.set(u.slug, u);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Sub-topics available for a subject slug (e.g. ai, machine-learning). */
export function syllabusSubtopicsForSubjectSlug(subjectSlug: string): SyllabusUnit[] {
  const slug = subjectSlug.trim().toLowerCase();
  if (slug === 'ai') return [...SYLLABUS_GROUPS.ai];
  if (slug === 'machine-learning' || slug === 'ml') return [...SYLLABUS_GROUPS.ml];
  return [];
}

export const SYLLABUS_GROUPS = {
  ...BASE_GROUPS,
  rmset: buildRmsetUnits(),
} as const;

export type SyllabusGroupKey = keyof typeof SYLLABUS_GROUPS;

export function syllabusUnitsForGroup(group: SyllabusGroupKey | null): SyllabusUnit[] {
  if (!group) return [];
  return [...SYLLABUS_GROUPS[group]];
}

/** All unique syllabus slugs (for seeding / bank load). */
export function allSyllabusUnits(): SyllabusUnit[] {
  return buildRmsetUnits();
}
