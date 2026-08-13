import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { drawExamQuestionsFromTopics } from '@/lib/exam-builder/draw-questions';
import {
  facultyQuestionFromProblem,
  type FacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import { PROGRAMMING_SAMPLE_PROBLEMS } from '@/lib/coding/sample-problems';
import { loadCodingBankFromDb } from '@/lib/coding/coding-bank-store';
import type { AssessmentFormat } from '@/lib/exams/programming-subjects';
import {
  defaultRubricForSubject,
  shuffleIfEnabled,
  type SubjectRubricConfig,
} from '@/lib/exams/pro-exam-rubric';
import { codingLanguageForSubjectSlug } from '@/lib/exams/subject-syllabus-map';

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

function codingQuestionsForLanguage(lang: 'c' | 'python', count: number): FacultyCodingQuestion[] {
  const problems = PROGRAMMING_SAMPLE_PROBLEMS.slice(0, Math.max(1, count));
  return problems.map((p) => facultyQuestionFromProblem(p));
}

async function codingFromBank(lang: 'c' | 'python', count: number): Promise<FacultyCodingQuestion[]> {
  const bank = await loadCodingBankFromDb({ language: lang, limit: count });
  if (!bank.length) return codingQuestionsForLanguage(lang, count);
  return bank.slice(0, count).map((p) => facultyQuestionFromProblem(p));
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

      if (needsMcq && row.mcqCount > 0) {
        const drawn = await drawExamQuestionsFromTopics(admin, {
          testType: input.testType,
          topicIds: [row.topicSlug],
          questionsPerTopic: row.mcqCount,
          slotKey: `${input.slotKey}-${subject.slug}-${row.topicSlug}`,
          createdBy: input.createdBy,
        });
        warnings.push(...drawn.warnings);
        const tagged = drawn.questions.map((q) =>
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
        const coding = await codingFromBank(lang, codingCount);
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

    const shuffled = shuffleIfEnabled(blockQuestions, rubric.shuffleQuestions !== false);
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
