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
  /\b(stdio\.h|printf\s*\(|scanf\s*\(|malloc\s*\(|pointers?|#include\s*<|write\s+(a|the)\s+c\s+program+e?|c\s+program+e?|in\s+c\s+language|c\s+language|header\s+file)\b/i;

export type EnforceSubjectPaperOptions = {
  forceJava?: boolean;
};

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

export function looksLikeCLanguageText(text: string): boolean {
  return C_TEXT.test(text);
}

export function isJavaCodingProblem(problem: {
  id?: string;
  title?: string;
  statement?: string;
  defaultLanguage?: string;
}): boolean {
  const id = String(problem.id ?? '');
  if (C_SAMPLE_IDS.has(id)) return false;
  if (problem.defaultLanguage === 'c' || problem.defaultLanguage === 'python') return false;
  if (looksLikeCLanguageText(`${problem.title ?? ''} ${problem.statement ?? ''}`)) return false;
  if (problem.defaultLanguage === 'java' || id.startsWith('java')) return true;
  return /\bjava\b/i.test(`${problem.title ?? ''} ${problem.statement ?? ''}`);
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
  const id = q.coding_problem_id ?? '';
  if (id.startsWith('java')) return false;
  if (C_SAMPLE_IDS.has(id)) return true;
  if (looksLikeCLanguageText(textOfFaculty(q))) return true;
  if (q.default_language === 'c' || q.default_language === 'python') return true;
  return false;
}

function isCMcqFaculty(q: FacultyMcqQuestion): boolean {
  return looksLikeCLanguageText(q.question_text);
}

function isCCodingUi(q: Question): boolean {
  const id = q.coding_problem_id ?? '';
  if (id.startsWith('java')) return false;
  if (C_SAMPLE_IDS.has(id)) return true;
  if (looksLikeCLanguageText(textOfUi(q))) return true;
  if (q.coding_default_language === 'c' || q.coding_default_language === 'python') return true;
  return false;
}

function isCMcqUi(q: Question): boolean {
  return looksLikeCLanguageText(q.question_text);
}

function nextJavaProblem(used: Set<string>): ProgrammingProblem {
  const unused = JAVA_POOL.filter((p) => !used.has(p.id));
  const pool = unused.length ? unused : JAVA_POOL;
  const problem = pool[used.size % pool.length]!;
  used.add(problem.id);
  return problem;
}

function nextJavaMcq(used: Set<string>): FacultyMcqQuestion {
  const unused = JAVA_ARRAY_MCQS.filter((item) => !used.has(item.q));
  const pool = unused.length ? unused : JAVA_ARRAY_MCQS;
  const item = pool[used.size % pool.length]!;
  used.add(item.q);
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
    ...facultyQuestionFromProblem(problem, 'java'),
    default_language: 'java',
    question_text: problem.statement,
    pro_subject: meta.pro_subject ?? 'Java',
    pro_subject_slug: meta.pro_subject_slug ?? 'java',
    pro_topic_slug: meta.pro_topic_slug ?? 'technical-java',
  };
}

function paperIsJavaFaculty(items: FacultyExamQuestion[], forceJava?: boolean): boolean {
  if (forceJava) return true;
  const tagged = items.filter(isJavaTaggedFaculty);
  if (tagged.length) return tagged.length >= Math.ceil(items.length / 2);
  return items.some(
    (q) =>
      (isFacultyCodingQuestion(q) &&
        (q.default_language === 'java' || q.coding_problem_id.startsWith('java'))) ||
      /\bjava\b/i.test(textOfFaculty(q)),
  );
}

function paperIsJavaUi(items: Question[], forceJava?: boolean): boolean {
  if (forceJava) return true;
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
export function enforceJavaFacultyPaper(
  items: FacultyExamQuestion[],
  options?: EnforceSubjectPaperOptions,
): FacultyExamQuestion[] {
  if (!items.length) return items;
  const wholePaperJava = paperIsJavaFaculty(items, options?.forceJava);
  if (!wholePaperJava && !items.some(isJavaTaggedFaculty)) return items;

  const usedCoding = new Set<string>();
  const usedMcq = new Set<string>();
  return items.map((q) => {
    if (!shouldRewriteFaculty(q, wholePaperJava)) return q;
    const meta = {
      pro_subject: q.pro_subject ?? 'Java',
      pro_subject_slug: q.pro_subject_slug ?? 'java',
      pro_topic_slug: q.pro_topic_slug ?? 'technical-java',
    };
    if (isFacultyCodingQuestion(q)) {
      if (!isCCodingFaculty(q) && (q.default_language === 'java' || q.coding_problem_id.startsWith('java'))) {
        usedCoding.add(q.coding_problem_id);
        return { ...q, ...meta, default_language: 'java' as const };
      }
      return codingFromJavaProblem(nextJavaProblem(usedCoding), meta);
    }
    if (isCMcqFaculty(q) || wholePaperJava && looksLikeCLanguageText(q.question_text)) {
      return { ...nextJavaMcq(usedMcq), ...meta };
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
export function enforceJavaUiPaper(
  items: Question[],
  options?: EnforceSubjectPaperOptions,
): Question[] {
  if (!items.length) return items;
  const wholePaperJava = paperIsJavaUi(items, options?.forceJava);
  if (!wholePaperJava && !items.some(isJavaTaggedUi)) return items;

  const usedCoding = new Set<string>();
  const usedMcq = new Set<string>();
  return items.map((q) => {
    if (!shouldRewriteUi(q, wholePaperJava)) return q;
    if (isCodingQuestion(q)) {
      if (!isCCodingUi(q) && (q.coding_default_language === 'java' || String(q.coding_problem_id ?? '').startsWith('java'))) {
        if (q.coding_problem_id) usedCoding.add(q.coding_problem_id);
        return {
          ...q,
          coding_default_language: 'java',
          tags: [
            ...new Set([...(q.tags ?? []), 'pro-subject:java', 'pro-subject-name:Java']),
          ],
        };
      }
      return javaUiFromProblem(nextJavaProblem(usedCoding), q);
    }
    if (isCMcqUi(q)) {
      return javaUiFromMcq(nextJavaMcq(usedMcq), q);
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
  if (looksLikeCLanguageText(textOfUi(question)) && !(meta && slugLooksLikeJava(meta.slug))) {
    return 'c';
  }
  if (question.coding_default_language === 'java') return 'java';
  if (question.coding_default_language === 'python') return 'python';
  if (question.coding_default_language === 'c') return 'c';
  if ((question.tags ?? []).some((tag) => typeof tag === 'string' && slugLooksLikeJava(tag))) {
    return 'java';
  }
  return null;
}
