import type { SyllabusUnit } from '@/lib/exam-builder/syllabus';

/** Fine-grained technical units for AI — slugs must match question_tags.slug in the DB. */
export const AI_SUBTOPICS: SyllabusUnit[] = [
  { slug: 'ai-search-algorithms', name: 'Search Algorithms (BFS, DFS, A*)' },
  { slug: 'ai-knowledge-representation', name: 'Knowledge Representation' },
  { slug: 'ai-expert-systems', name: 'Expert Systems' },
  { slug: 'ai-propositional-logic', name: 'Propositional Logic' },
  { slug: 'ai-nlp-basics', name: 'NLP Basics' },
  { slug: 'ai-neural-networks-intro', name: 'Neural Networks (Intro)' },
  { slug: 'ai-game-theory', name: 'Game Theory & Minimax' },
  { slug: 'ai-planning', name: 'Automated Planning' },
];

/** Fine-grained technical units for Machine Learning — one exam can focus on a single algorithm. */
export const ML_SUBTOPICS: SyllabusUnit[] = [
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
];

const SUBJECT_SLUG_TO_SUBTOPICS: Record<string, SyllabusUnit[]> = {
  ai: AI_SUBTOPICS,
  'machine-learning': ML_SUBTOPICS,
};

export function subtopicsForSubject(input: { slug: string; subjectName: string }): SyllabusUnit[] {
  const slug = input.slug.trim().toLowerCase();
  if (SUBJECT_SLUG_TO_SUBTOPICS[slug]) return SUBJECT_SLUG_TO_SUBTOPICS[slug];
  const name = input.subjectName.trim().toLowerCase();
  if (name === 'ai' || name.includes('artificial intelligence')) return AI_SUBTOPICS;
  if (name.includes('machine learning') || name === 'ml') return ML_SUBTOPICS;
  return [];
}

export function subjectHasSubtopics(input: { slug: string; subjectName: string }): boolean {
  return subtopicsForSubject(input).length > 0;
}
