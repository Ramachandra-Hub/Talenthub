import type { Question } from '@/lib/types';

export type SubjectAnswerProgress = {
  subjectName: string;
  subjectSlug: string;
  answered: number;
  total: number;
  percent: number;
};

function readProSubjectMeta(question: Question): { name: string; slug: string } | null {
  const tags = question.tags ?? [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    if (tag.startsWith('pro-subject:')) {
      const slug = tag.slice('pro-subject:'.length).trim();
      if (!slug) continue;
      const nameTag = tags.find(
        (t) => typeof t === 'string' && t.startsWith('pro-subject-name:'),
      );
      const name =
        typeof nameTag === 'string'
          ? nameTag.slice('pro-subject-name:'.length).trim()
          : slug.replace(/-/g, ' ');
      return { name, slug };
    }
  }
  return null;
}

function isAnswered(questionId: string, answers: Record<string, unknown>): boolean {
  const row = answers[questionId];
  if (row == null) return false;
  if (typeof row === 'string') return row.trim().length > 0;
  if (typeof row === 'object') {
    const obj = row as Record<string, unknown>;
    const userAnswer = obj.userAnswer ?? obj.answer ?? obj.selected;
    if (typeof userAnswer === 'string') return userAnswer.trim().length > 0;
    if (userAnswer != null) return true;
  }
  return false;
}

/** Per-subject completion 0–100% for multi-subject pro exams. */
export function computeSubjectAnswerProgress(
  questions: Question[],
  answers: Record<string, unknown>,
): SubjectAnswerProgress[] {
  const buckets = new Map<string, SubjectAnswerProgress>();

  for (const question of questions) {
    const meta = readProSubjectMeta(question);
    if (!meta) continue;
    const key = meta.slug;
    const bucket =
      buckets.get(key) ??
      ({
        subjectName: meta.name,
        subjectSlug: meta.slug,
        answered: 0,
        total: 0,
        percent: 0,
      } satisfies SubjectAnswerProgress);
    bucket.total += 1;
    if (isAnswered(question.id, answers)) bucket.answered += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      percent: row.total > 0 ? Math.round((row.answered / row.total) * 100) : 0,
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export function questionTagsFromProMetadata(q: {
  pro_subject?: string;
  pro_subject_slug?: string;
  pro_topic_slug?: string;
  logic_only?: boolean;
}): string[] {
  const tags: string[] = [];
  if (q.pro_subject_slug) tags.push(`pro-subject:${q.pro_subject_slug}`);
  if (q.pro_subject) tags.push(`pro-subject-name:${q.pro_subject}`);
  if (q.pro_topic_slug) tags.push(`pro-topic:${q.pro_topic_slug}`);
  if (q.logic_only) tags.push('logic-only-coding');
  return tags;
}
