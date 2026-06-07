import { ACADEMIC_YEARS } from '@/lib/college-brand';

export type FacultyExamStatus = 'pending' | 'approved' | 'rejected';

import type { FacultyCodingQuestion } from '@/lib/exam-builder/programming-syllabus';

export type FacultyMcqQuestion = {
  question_type?: 'mcq';
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
};

export type FacultyExamQuestion = FacultyMcqQuestion | FacultyCodingQuestion;

export function isFacultyMcqQuestion(q: FacultyExamQuestion): q is FacultyMcqQuestion {
  return (q as FacultyCodingQuestion).question_type !== 'coding';
}

export type FacultyExamRequest = {
  id: string;
  faculty_user_id: string;
  department: string;
  /** Topic / unit / chapter the exam covers (e.g. "Operating Systems · Scheduling"). */
  topic: string | null;
  title: string;
  description: string | null;
  target_years: string[];
  /**
   * Additional branches the exam should be made available to. Empty array means
   * "only faculty's own department". A student sees the exam if their branch
   * matches `department` OR is included in `target_branches`.
   */
  target_branches: string[];
  duration_minutes: number;
  questions_json: FacultyExamQuestion[];
  status: FacultyExamStatus;
  admin_note: string | null;
  published_test_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export const FACULTY_EXAM_YEARS = [...ACADEMIC_YEARS];

export function parseQuestionsJson(raw: unknown): FacultyExamQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: FacultyExamQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const text = String(q.question_text ?? '').trim();
    if (!text) continue;

    if (q.question_type === 'coding') {
      const problemId = String(q.coding_problem_id ?? 'double-number').trim();
      out.push({
        question_type: 'coding',
        question_text: text,
        coding_problem_id: problemId,
        title: q.title ? String(q.title) : undefined,
        sample_input: q.sample_input ? String(q.sample_input) : undefined,
        sample_output: q.sample_output ? String(q.sample_output) : undefined,
        input_format: q.input_format ? String(q.input_format) : undefined,
        output_format: q.output_format ? String(q.output_format) : undefined,
        hint: q.hint ? String(q.hint) : undefined,
      });
      continue;
    }

    const letter = String(q.correct_answer ?? 'A').toUpperCase();
    const correct = ['A', 'B', 'C', 'D'].includes(letter) ? (letter as 'A' | 'B' | 'C' | 'D') : 'A';
    out.push({
      question_type: 'mcq',
      question_text: text,
      option_a: String(q.option_a ?? '').trim(),
      option_b: String(q.option_b ?? '').trim(),
      option_c: String(q.option_c ?? '').trim(),
      option_d: String(q.option_d ?? '').trim(),
      correct_answer: correct,
      explanation: q.explanation ? String(q.explanation) : undefined,
    });
  }
  return out;
}
