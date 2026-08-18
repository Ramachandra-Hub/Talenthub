import type { Question } from '@/lib/types';

/** Strip grading fields before sending questions to the student browser. */
export function sanitizeQuestionsForStudent(questions: Question[]): Question[] {
  return questions.map((q) => {
    const { correct_answer: _ca, explanation: _ex, ...rest } = q;
    return {
      ...rest,
      correct_answer: '',
      explanation: null,
      option_a: undefined,
      option_b: undefined,
      option_c: undefined,
      option_d: undefined,
      coding_starter_code: null,
      coding_hint: null,
      coding_test_cases: null,
    };
  });
}
