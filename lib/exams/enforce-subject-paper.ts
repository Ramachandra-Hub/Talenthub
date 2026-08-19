import { JAVA_ARRAY_PROBLEMS } from '@/lib/coding/java-array-problems';
import { JAVA_CORE_50_PROBLEMS } from '@/lib/coding/java-core50-problems';
import { PROGRAMMING_SAMPLE_PROBLEMS, type ProgrammingProblem } from '@/lib/coding/sample-problems';
import {
  facultyQuestionFromProblem,
  isFacultyCodingQuestion,
  type FacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import type { FacultyExamQuestion, FacultyMcqQuestion } from '@/lib/faculty-exams';
import { JAVA_ARRAY_MCQS } from '@/lib/placement/java-array-mcq-bank';
import { isCodingQuestion } from '@/lib/practice-mappers';
import { readProSubjectMeta } from '@/lib/exam-v2/subject-progress';
import type { Question } from '@/lib/types';

const JAVA_POOL: ProgrammingProblem[] = [...JAVA_CORE_50_PROBLEMS, ...JAVA_ARRAY_PROBLEMS];
const C_SAMPLE_IDS = new Set(PROGRAMMING_SAMPLE_PROBLEMS.map((p) => p.id));

const C_TEXT =
  /\b(stdio\.h|printf\s*\(|scanf\s*\(|malloc\s*\(|pointer|pointers|#include\s*<|write a c program|c program|in c language|c language|header file)\b/i;

function textOfFaculty(q: FacultyExamQuestion): string {
  if (isFacultyCodingQuestion(q)) {
    return `${q.question_text} ${q.title ?? ''} ${q.coding_problem_id}`;
  }
  return q.question_text;
}

function textOfUi(q: Question): string {
  return `${q.question_text} ${q.coding_title ?? ''} ${q.coding_problem_id ?? ''}`;
}

export function slugLooksLikeJava(slug: string | null | undefined): boolean {
  return String(slug ?? '')
    .trim()
    .toLowerCase()
    .includes('java');
}

export function nameLooksLikeJava(name: string | null | undefined): boolean {
  return /\bjava\b/i.test(String(name ?? ''));
}

function facultySubjectSlug(q: FacultyExamQuestion): string {
  return String(q.pro_subject_slug ?? '').trim().toLowerCase();
}

function isJavaTaggedFaculty(q: FacultyExamQuestion): boolean {
  return slugLooksLikeJava(facultySubjectSlug(q)) || nameLooksLikeJava(q.pro_subject);
}

function isJavaTaggedUi(q: Question): boolean {
  const meta = readProSubjectMeta(q);
  if (meta && (slugLooksLikeJava(meta.slug) || nameLooksLikeJava(meta.name))) return true;
  return (q.tags ?? []).some((tag) => typeof tag === 'string' && slugLooksLikeJava(tag));
}

function isCCodingFaculty(q: FacultyCodingQuestion): boolean {
  if (q.default_language === 'java') return false;
  if (q.coding_problem_id.startsWith('java')) return false;
  if (C_SAMPLE_IDS.has(q.coding_problem_id)) return true;
  if (q.default_language === 'c' || q.default_language === 'python') return true;
  return C_TEXT.test(textOfFaculty(q));
}

function isCMcqFaculty(q: FacultyMcqQuestion): boolean {
  return C_TEXT.test(q.question_text);
}

function isCCodingUi(q: Question): boolean {
  if (q.coding_default_language === 'java') return false;
  const id = q.coding_problem_id ?? '';
  if (id.startsWith('java')) return false;
  if (C_SAMPLE_IDS.has(id)) return true;
  if (q.coding_default_language === 'c' || q.coding_default_language === 'python') return true;
  return C_TEXT.test(textOfUi(q));
}

function isCMcqUi(q: Question): boolean {
  return C_TEXT.test(q.question_text);
}

function javaProblemAt(index: number): ProgrammingProblem {
  return JAVA_POOL[index % JAVA_POOL.length]!;
}

function javaMcqAt(index: number): FacultyMcqQuestion {
  const item = JAVA_ARRAY_MCQS[index % JAVA_ARRAY_MCQS.length]!;
  return {
    question_type: 'mcq',
    question_text: item.q,
    option_a: item.options[0],
    option_b: item.options[1],
    option_c: item.options[2],
    option_d: item.options[3],
    correct_answer: item.correct,
    explanation: item.explanation,
  };
}

function codingFromJavaProblem(
  problem: ProgrammingProblem,
  meta: { pro_subject?: string; pro_subject_slug?: string; pro_topic_slug?: string },
): FacultyCodingQuestion {
  return {
    ...facultyQuestionFromProblem(problem),
    default_language: 'java',
    question_text: problem.statement,
    pro_subject: meta.pro_subject ?? 'Java',
    pro_subject_slug: meta.pro_subject_slug ?? 'java',
    pro_topic_slug: meta.pro_topic_slug ?? 'technical-java',
  };
}

function paperIsJavaFaculty(items: FacultyExamQuestion[]): boolean {
  const tagged = items.filter(isJavaTaggedFaculty);
  if (tagged.length) return tagged.length >= Math.ceil(items.length / 2);
  return items.some(
    (q) =>
      (isFacultyCodingQuestion(q) &&
        (q.default_language === 'java' || q.coding_problem_id.startsWith('java'))) ||
      /\bjava\b/i.test(textOfFaculty(q)),
  );
}

function paperIsJavaUi(items: Question[]): boolean {
  const tagged = items.filter(isJavaTaggedUi);
  if (tagged.length) return tagged.length >= Math.ceil(items.length / 2);
  return items.some(
    (q) =>
      q.coding_default_language === 'java' ||
      String(q.coding_problem_id ?? '').startsWith('java') ||
      /\bjava\b/i.test(textOfUi(q)),
  );
}

function shouldRewriteFaculty(q: FacultyExamQuestion, wholePaperJava: boolean): boolean {
  if (isJavaTaggedFaculty(q)) return true;
  return wholePaperJava && !q.pro_subject_slug;
}

function shouldRewriteUi(q: Question, wholePaperJava: boolean): boolean {
  if (isJavaTaggedUi(q)) return true;
  return wholePaperJava && !readProSubjectMeta(q);
}

/** Replace leaked C items with Java MCQs/coding when the conducted subject is Java. */
export function enforceJavaFacultyPaper(items: FacultyExamQuestion[]): FacultyExamQuestion[] {
  if (!items.length) return items;
  const wholePaperJava = paperIsJavaFaculty(items);
  if (!wholePaperJava && !items.some(isJavaTaggedFaculty)) return items;

  let javaCodingIndex = 0;
  let javaMcqIndex = 0;
  return items.map((q) => {
    if (!shouldRewriteFaculty(q, wholePaperJava)) return q;
    const meta = {
      pro_subject: q.pro_subject ?? 'Java',
      pro_subject_slug: q.pro_subject_slug ?? 'java',
      pro_topic_slug: q.pro_topic_slug ?? 'technical-java',
    };
    if (isFacultyCodingQuestion(q)) {
      if (!isCCodingFaculty(q) && q.default_language === 'java') {
        return { ...q, ...meta, default_language: 'java' as const };
      }
      const next = codingFromJavaProblem(javaProblemAt(javaCodingIndex), meta);
      javaCodingIndex += 1;
      return next;
    }
    if (isCMcqFaculty(q)) {
      const next: FacultyExamQuestion = { ...javaMcqAt(javaMcqIndex), ...meta };
      javaMcqIndex += 1;
      return next;
    }
    return { ...q, ...meta } as FacultyExamQuestion;
  });
}

function javaUiFromProblem(problem: ProgrammingProblem, base: Question): Question {
  return {
    ...base,
    question_text: problem.statement,
    tags: [
      ...new Set([
        ...(base.tags ?? []),
        'pro-subject:java',
        'pro-subject-name:Java',
        'pro-topic:technical-java',
      ]),
    ],
    coding_problem_id: problem.id,
    coding_title: problem.title,
    coding_sample_input: problem.sampleInput,
    coding_sample_output: problem.sampleOutput,
    coding_input_format: problem.inputFormat,
    coding_output_format: problem.outputFormat,
    coding_default_language: 'java',
    coding_test_cases: problem.testCases,
  };
}

function javaUiFromMcq(item: FacultyMcqQuestion, base: Question): Question {
  return {
    ...base,
    question_text: item.question_text,
    options: [item.option_a, item.option_b, item.option_c, item.option_d],
    correct_answer: item.correct_answer,
    explanation: item.explanation ?? null,
    option_a: item.option_a,
    option_b: item.option_b,
    option_c: item.option_c,
    option_d: item.option_d,
    tags: [
      ...new Set([
        ...(base.tags ?? []),
        'pro-subject:java',
        'pro-subject-name:Java',
        'pro-topic:technical-java',
      ]),
    ],
  };
}

/** Same rewrite for student-facing Question objects (already published papers). */
export function enforceJavaUiPaper(items: Question[]): Question[] {
  if (!items.length) return items;
  const wholePaperJava = paperIsJavaUi(items);
  if (!wholePaperJava && !items.some(isJavaTaggedUi)) return items;

  let javaCodingIndex = 0;
  let javaMcqIndex = 0;
  return items.map((q) => {
    if (!shouldRewriteUi(q, wholePaperJava)) return q;
    if (isCodingQuestion(q)) {
      if (!isCCodingUi(q) && q.coding_default_language === 'java') {
        return {
          ...q,
          coding_default_language: 'java',
          tags: [
            ...new Set([...(q.tags ?? []), 'pro-subject:java', 'pro-subject-name:Java']),
          ],
        };
      }
      const next = javaUiFromProblem(javaProblemAt(javaCodingIndex), q);
      javaCodingIndex += 1;
      return next;
    }
    if (isCMcqUi(q)) {
      const item = javaMcqAt(javaMcqIndex);
      javaMcqIndex += 1;
      return javaUiFromMcq(item, q);
    }
    return {
      ...q,
      tags: [...new Set([...(q.tags ?? []), 'pro-subject:java', 'pro-subject-name:Java'])],
    };
  });
}

export function codingLanguageFromQuestion(question: Question): 'c' | 'python' | 'java' | null {
  const meta = readProSubjectMeta(question);
  if (meta && slugLooksLikeJava(meta.slug)) return 'java';
  if (meta && (/\bpython\b/i.test(meta.slug) || /\bpython\b/i.test(meta.name))) return 'python';
  if (question.coding_default_language === 'java') return 'java';
  if (question.coding_default_language === 'python') return 'python';
  if (question.coding_default_language === 'c') return 'c';
  if ((question.tags ?? []).some((tag) => typeof tag === 'string' && slugLooksLikeJava(tag))) {
    return 'java';
  }
  return null;
}
