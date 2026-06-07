import type { Question } from '@/lib/types';

/** Normalize MCQ stem for duplicate detection (punctuation-insensitive). */
export function normalizeQuestionStem(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function questionStemFingerprint(q: Question): string {
  return normalizeQuestionStem(q.question_text ?? '');
}

/** Drop repeated stems within one test paper (keeps first occurrence). */
export function dedupeQuestionsByStem(questions: Question[]): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of questions) {
    const key = questionStemFingerprint(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
