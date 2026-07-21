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
  codingLanguageForSubjectSlug,
  syllabusTopicSlugForSubject,
} from '@/lib/exams/subject-syllabus-map';

export type ProExamSubjectRow = {
  subjectName: string;
  slug: string;
  assessmentFormat: AssessmentFormat;
};

export type DrawQuestionsForProExamResult = {
  questions: FacultyExamQuestion[];
  topicSlugs: string[];
  warnings: string[];
};

function codingQuestionsForLanguage(lang: 'c' | 'python', count: number): FacultyCodingQuestion[] {
  const problems = PROGRAMMING_SAMPLE_PROBLEMS.slice(0, Math.max(1, count));
  return problems.map((p) => facultyQuestionFromProblem(p));
}

async function codingFromBank(lang: 'c' | 'python', count: number): Promise<FacultyCodingQuestion[]> {
  const bank = await loadCodingBankFromDb({ language: lang, limit: count });
  if (!bank.length) return codingQuestionsForLanguage(lang, count);
  return bank.slice(0, count).map((p) => facultyQuestionFromProblem(p));
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
  const mcqTopicIds: string[] = [];
  const allQuestions: FacultyExamQuestion[] = [];

  for (const subject of input.subjects) {
    const topicSlug = syllabusTopicSlugForSubject({
      slug: subject.slug,
      subjectName: subject.subjectName,
    });
    topicSlugs.push(topicSlug);

    const format = subject.assessmentFormat;
    const needsMcq = format === 'mcq' || format === 'both';
    const needsCoding = format === 'coding' || format === 'both';

    if (needsMcq) {
      mcqTopicIds.push(topicSlug);
    }

    if (needsCoding) {
      const lang = codingLanguageForSubjectSlug(subject.slug);
      const coding = await codingFromBank(lang, input.codingProblemsPerSubject);
      allQuestions.push(...coding);
    }
  }

  if (mcqTopicIds.length) {
    const drawn = await drawExamQuestionsFromTopics(admin, {
      testType: input.testType,
      topicIds: [...new Set(mcqTopicIds)],
      questionsPerTopic: input.questionsPerSubject,
      slotKey: input.slotKey,
      createdBy: input.createdBy,
    });
    warnings.push(...drawn.warnings);
    allQuestions.unshift(...drawn.questions);
  }

  if (!allQuestions.length) {
    throw new Error('No questions could be drawn for the selected subjects.');
  }

  return {
    questions: allQuestions,
    topicSlugs: [...new Set(topicSlugs)],
    warnings,
  };
}
