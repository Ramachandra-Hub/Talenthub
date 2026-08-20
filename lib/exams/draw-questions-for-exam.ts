import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { drawExamQuestionsFromTopics } from '@/lib/exam-builder/draw-questions';
import {
  facultyQuestionFromProblem,
  type FacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import { PROGRAMMING_SAMPLE_PROBLEMS } from '@/lib/coding/sample-problems';
import { JAVA_ARRAY_PROBLEMS } from '@/lib/coding/java-array-problems';
import { JAVA_CORE_50_PROBLEMS } from '@/lib/coding/java-core50-problems';
import {
  ensureJavaArrayCodingBank,
  ensureJavaCore50CodingBank,
  loadCodingBankFromDb,
} from '@/lib/coding/coding-bank-store';
import type { AssessmentFormat } from '@/lib/exams/programming-subjects';
import {
  defaultRubricForSubject,
  shuffleIfEnabled,
  type SubjectRubricConfig,
} from '@/lib/exams/pro-exam-rubric';
import { codingLanguageForSubjectSlug } from '@/lib/exams/subject-syllabus-map';
import { enforceJavaFacultyPaper, isJavaCodingProblem, looksLikeCLanguageText } from '@/lib/exams/enforce-subject-paper';

export type ProExamSubjectRow = {
  subjectId?: string;
  subjectName: string;
  slug: string;
  assessmentFormat: AssessmentFormat;
  rubric?: SubjectRubricConfig | null;
};

export type ProExamSubjectBlock = {
  subjectName: string;
  subjectSlug: string;
  questions: FacultyExamQuestion[];
  questionCount: number;
};

export type DrawQuestionsForProExamResult = {
  questions: FacultyExamQuestion[];
  subjectBlocks: ProExamSubjectBlock[];
  topicSlugs: string[];
  warnings: string[];
};

function tagQuestion(
  q: FacultyExamQuestion,
  meta: {
    subjectName: string;
    subjectSlug: string;
    topicSlug: string;
    logicOnly?: boolean;
  },
): FacultyExamQuestion {
  const base = {
    pro_subject: meta.subjectName,
    pro_subject_slug: meta.subjectSlug,
    pro_topic_slug: meta.topicSlug,
  };
  if (q.question_type === 'coding') {
    return {
      ...q,
      ...base,
      logic_only: meta.logicOnly ?? false,
    };
  }
  return { ...q, ...base };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let state = hashSeed(seed) || 1;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function codingQuestionsForLanguage(
  lang: 'c' | 'python' | 'java',
  count: number,
  seed: string,
): FacultyCodingQuestion[] {
  const pool =
    lang === 'java'
      ? [...JAVA_CORE_50_PROBLEMS, ...JAVA_ARRAY_PROBLEMS].filter(isJavaCodingProblem)
      : PROGRAMMING_SAMPLE_PROBLEMS;
  return seededShuffle(uniqueProblemsByTitle(pool), seed)
    .slice(0, Math.max(1, count))
    .map((p) => facultyQuestionFromProblem(p, lang));
}

function uniqueProblemsByTitle<T extends { title: string }>(problems: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const problem of problems) {
    const key = problem.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(problem);
  }
  return out;
}

async function codingFromBank(
  lang: 'c' | 'python' | 'java',
  count: number,
  seed: string,
): Promise<FacultyCodingQuestion[]> {
  if (lang === 'java') {
    await ensureJavaCore50CodingBank();
    await ensureJavaArrayCodingBank();
    const bank = await loadCodingBankFromDb({ language: 'java', limit: 1000 });
    const catalog = [...JAVA_CORE_50_PROBLEMS, ...JAVA_ARRAY_PROBLEMS];
    const byTitle = new Map(bank.map((p) => [p.title.trim().toLowerCase(), p]));
    const ordered = uniqueProblemsByTitle(
      [
        ...catalog.map((p) => byTitle.get(p.title.trim().toLowerCase()) ?? p),
        ...bank,
      ].filter(isJavaCodingProblem),
    );
    return seededShuffle(ordered, seed)
      .slice(0, Math.max(1, count))
      .map((p) => facultyQuestionFromProblem(p, 'java'));
  }
  const bank = await loadCodingBankFromDb({ language: lang, limit: Math.max(count * 4, 20) });
  if (!bank.length) return codingQuestionsForLanguage(lang, count, seed);
  return seededShuffle(uniqueProblemsByTitle(bank), seed)
    .slice(0, count)
    .map((p) => facultyQuestionFromProblem(p, lang));
}

function resolveRubric(
  subject: ProExamSubjectRow,
  questionsPerSubject: number,
  codingProblemsPerSubject: number,
): SubjectRubricConfig {
  if (subject.rubric?.topics?.length) return subject.rubric;
  const needsCoding = subject.assessmentFormat === 'coding' || subject.assessmentFormat === 'both';
  return defaultRubricForSubject({
    slug: subject.slug,
    subjectName: subject.subjectName,
    questionsPerSubject,
    codingCount: needsCoding ? codingProblemsPerSubject : 0,
  });
}

export async function drawQuestionsForProExam(
  admin: DbServiceClient,
  input: {
    subjects: ProExamSubjectRow[];
    questionsPerSubject: number;
    codingProblemsPerSubject: number;
    testType: string;
    slotKey: string;
    createdBy: string;
  },
): Promise<DrawQuestionsForProExamResult> {
  const warnings: string[] = [];
  const topicSlugs: string[] = [];
  const subjectBlocks: ProExamSubjectBlock[] = [];
  const allQuestions: FacultyExamQuestion[] = [];

  for (const subject of input.subjects) {
    const rubric = resolveRubric(subject, input.questionsPerSubject, input.codingProblemsPerSubject);
    const format = subject.assessmentFormat;
    const needsMcq = format === 'mcq' || format === 'both';
    const needsCoding = format === 'coding' || format === 'both';
    const lang = codingLanguageForSubjectSlug(subject.slug);
    const blockQuestions: FacultyExamQuestion[] = [];

    for (const row of rubric.topics) {
      topicSlugs.push(row.topicSlug);

      if (needsMcq && row.mcqCount > 0 && row.topicSlug !== 'coding-java') {
        const drawn = await drawExamQuestionsFromTopics(admin, {
          testType: input.testType,
          topicIds: [row.topicSlug],
          questionsPerTopic: row.mcqCount,
          slotKey: `${input.slotKey}-${subject.slug}-${row.topicSlug}`,
          createdBy: input.createdBy,
        });
        warnings.push(...drawn.warnings);
        const tagged = drawn.questions
          .filter((q) => lang !== 'java' || !looksLikeCLanguageText(q.question_text))
          .map((q) =>
          tagQuestion(q, {
            subjectName: subject.subjectName,
            subjectSlug: subject.slug,
            topicSlug: row.topicSlug,
          }),
        );
        blockQuestions.push(...tagged);
      }

      const codingCount = needsCoding ? (row.codingCount ?? 0) : 0;
      if (codingCount > 0) {
        const coding = await codingFromBank(lang, codingCount, `${input.slotKey}-${subject.slug}-${row.topicSlug}`);
        blockQuestions.push(
          ...coding.map((q) =>
            tagQuestion(q, {
              subjectName: subject.subjectName,
              subjectSlug: subject.slug,
              topicSlug: row.topicSlug,
              logicOnly: rubric.logicOnlyCoding ?? true,
            }),
          ),
        );
      }
    }

    const shuffled = shuffleIfEnabled(
      enforceJavaFacultyPaper(blockQuestions, {
        forceJava: lang === 'java' || subject.slug.toLowerCase().includes('java'),
      }),
      rubric.shuffleQuestions !== false,
    );
    subjectBlocks.push({
      subjectName: subject.subjectName,
      subjectSlug: subject.slug,
      questions: shuffled,
      questionCount: shuffled.length,
    });
    allQuestions.push(...shuffled);
  }

  if (!allQuestions.length) {
    throw new Error('No questions could be drawn for the selected subjects.');
  }

  return {
    questions: allQuestions,
    subjectBlocks,
    topicSlugs: [...new Set(topicSlugs)],
    warnings,
  };
}
