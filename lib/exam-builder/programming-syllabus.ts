import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import {
  PROGRAMMING_SAMPLE_PROBLEMS,
  type ProgrammingProblem,
} from '@/lib/coding/sample-problems';
import { getJavaArrayProblemById } from '@/lib/coding/java-array-problems';
import { getJavaCore50ProblemById } from '@/lib/coding/java-core50-problems';

export const PROGRAMMING_SYLLABUS_SLUGS = new Set([
  'technical-programming',
  'programming',
  'coding',
]);

export type FacultyCodingQuestion = {
  question_type: 'coding';
  question_text: string;
  coding_problem_id: string;
  title?: string;
  sample_input?: string;
  sample_output?: string;
  input_format?: string;
  output_format?: string;
  hint?: string;
  starter_code?: string;
  default_language?: 'c' | 'python' | 'java';
  test_cases?: Array<{ input: string; expectedOutput: string; explanation?: string }>;
  pro_subject?: string;
  pro_subject_slug?: string;
  pro_topic_slug?: string;
  /** When true, grade only against sample I/O (logic check). */
  logic_only?: boolean;
};

export function isFacultyCodingQuestion(
  q: FacultyExamQuestion,
): q is FacultyCodingQuestion {
  return (q as FacultyCodingQuestion).question_type === 'coding';
}

export function slugLooksLikeProgramming(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return PROGRAMMING_SYLLABUS_SLUGS.has(s) || s.includes('programming') || s === 'dsa';
}

export function examShouldIncludeCodingQuestions(
  testType: string | null | undefined,
  topicSlugs: string[],
): boolean {
  if (topicSlugs.some(slugLooksLikeProgramming)) return true;
  if (testType === 'technical' && topicSlugs.length === 0) return false;
  return false;
}

export function facultyQuestionFromProblem(problem: ProgrammingProblem): FacultyCodingQuestion {
  return {
    question_type: 'coding',
    question_text: problem.statement,
    coding_problem_id: problem.id,
    title: problem.title,
    sample_input: problem.sampleInput,
    sample_output: problem.sampleOutput,
    input_format: problem.inputFormat,
    output_format: problem.outputFormat,
    hint: problem.hint,
    default_language: problem.defaultLanguage,
    test_cases: problem.testCases,
  };
}

/** Insert coding problems into an MCQ paper when Programming syllabus is selected. */
export function augmentExamQuestionsWithCoding(
  mcqs: FacultyExamQuestion[],
  topicSlugs: string[],
  testType: string | null | undefined,
): FacultyExamQuestion[] {
  if (!examShouldIncludeCodingQuestions(testType, topicSlugs)) return mcqs;

  const programmingTopicCount = topicSlugs.filter(slugLooksLikeProgramming).length;
  const codingCount = Math.min(
    PROGRAMMING_SAMPLE_PROBLEMS.length,
    Math.max(1, programmingTopicCount),
  );
  const coding = PROGRAMMING_SAMPLE_PROBLEMS.slice(0, codingCount).map(facultyQuestionFromProblem);

  if (!mcqs.length) return coding;

  const out: FacultyExamQuestion[] = [];
  let codingIdx = 0;
  const interval = Math.max(3, Math.floor(mcqs.length / (coding.length + 1)));

  mcqs.forEach((q, index) => {
    out.push(q);
    if ((index + 1) % interval === 0 && codingIdx < coding.length) {
      out.push(coding[codingIdx]);
      codingIdx += 1;
    }
  });

  while (codingIdx < coding.length) {
    out.push(coding[codingIdx]);
    codingIdx += 1;
  }

  return out;
}

export function getProgrammingProblemById(id: string): ProgrammingProblem | undefined {
  return (
    PROGRAMMING_SAMPLE_PROBLEMS.find((p) => p.id === id) ??
    getJavaCore50ProblemById(id) ??
    getJavaArrayProblemById(id)
  );
}
