import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getDbService } from '@/lib/db/get-db-service';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';
import { createFacultyExamRequestRecord } from '@/lib/exam-builder/create-exam-request';
import { drawExamQuestionsFromTopics } from '@/lib/exam-builder/draw-questions';
import { examQuestionToDbRow } from '@/lib/exam-builder/exam-question-db-row';
import {
  facultyQuestionFromProblem,
  isFacultyCodingQuestion,
} from '@/lib/exam-builder/programming-syllabus';
import { parseQuestionsJson, type FacultyExamQuestion } from '@/lib/faculty-exams';
import { goLiveExamScheduleNow } from '@/lib/exam-schedule-slots';
import { openNextAttemptRoundForSchedule } from '@/lib/admin/open-attempt-round';
import { loadUploadedCodingBank } from '@/lib/coding/coding-bank-store';
import { CODING_UPLOAD_TAG } from '@/lib/coding/coding-bank-persist';
import {
  JAVA_TODAY_DURATION_MINUTES,
  JAVA_TODAY_MCQ_COUNT,
  JAVA_TODAY_NOTICE,
  JAVA_TODAY_POOL_MCQ,
  JAVA_TODAY_SLOT_KEY,
  JAVA_TODAY_TOTAL_MARKS,
  javaTodayDescription,
  javaTodayExamTitle,
} from '@/lib/exams/java-today-exam';
import { invalidateQuestionScoreCache } from '@/lib/exam-v2/question-score-cache';

export type JavaTodayExamResult = {
  requestId: string;
  testId: string;
  scheduleId: string;
  title: string;
  mcqPool: number;
  codingPool: number;
  studentPaper: string;
  totalMarks: number;
  retakeOpened: boolean;
  attemptRound: number;
  message: string;
};

async function findExistingJavaTodayRequest() {
  return prisma.facultyExamRequest.findFirst({
    where: {
      status: 'approved',
      slotKey: JAVA_TODAY_SLOT_KEY,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      publishedTestId: true,
      title: true,
      questionsJson: true,
    },
  });
}

async function latestScheduleForRequest(requestId: string, testId: string | null) {
  const byRequest = await prisma.examSchedule.findFirst({
    where: { facultyExamRequestId: requestId },
    orderBy: [{ attemptRound: 'desc' }, { createdAt: 'desc' }],
  });
  if (byRequest) return byRequest;
  if (!testId) return null;
  return prisma.examSchedule.findFirst({
    where: { testId },
    orderBy: [{ attemptRound: 'desc' }, { createdAt: 'desc' }],
  });
}

async function loadUploadedJavaCodingQuestions(): Promise<FacultyExamQuestion[]> {
  const uploaded = await loadUploadedCodingBank({ language: 'java', limit: 1000 });
  if (uploaded.length < 2) {
    throw new Error(
      `Need at least 2 Java coding problems from an uploaded document (found ${uploaded.length}). Upload the coding PDF/DOCX under Questions → Coding — Java, then go live again.`,
    );
  }
  return uploaded.map((problem) => ({
    ...facultyQuestionFromProblem(problem, 'java'),
    pro_subject: 'Java',
    pro_subject_slug: 'java',
    pro_topic_slug: 'coding-java',
  }));
}

function isDbCodingRow(row: { type: string | null; questionType: string | null }): boolean {
  const type = String(row.type ?? '').toUpperCase();
  const qt = String(row.questionType ?? '').toLowerCase();
  return type === 'CODING' || qt === 'coding';
}

async function replacePublishedCodingQuestions(input: {
  requestId: string;
  testId: string;
  codingQuestions: FacultyExamQuestion[];
  mcqQuestions: FacultyExamQuestion[];
}): Promise<void> {
  const nextJson = [...input.mcqQuestions, ...input.codingQuestions];
  await prisma.facultyExamRequest.update({
    where: { id: input.requestId },
    data: {
      questionsJson: nextJson as Prisma.InputJsonValue,
      description: javaTodayDescription(),
    },
  });

  const links = await prisma.testQuestion.findMany({ where: { testId: input.testId } });
  const linkedIds = links.map((l) => l.questionId);
  const linkedRows = linkedIds.length
    ? await prisma.question.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, type: true, questionType: true, testId: true },
      })
    : [];
  let mcqIds = linkedRows.filter((row) => !isDbCodingRow(row)).map((row) => row.id);
  const codingIds = linkedRows.filter((row) => isDbCodingRow(row)).map((row) => row.id);
  if (!mcqIds.length) {
    const owned = await prisma.question.findMany({
      where: { testId: input.testId },
      select: { id: true, type: true, questionType: true },
    });
    mcqIds = owned.filter((row) => !isDbCodingRow(row)).map((row) => row.id);
  }

  if (codingIds.length) {
    await prisma.testQuestion.deleteMany({
      where: { testId: input.testId, questionId: { in: codingIds } },
    });
    await prisma.question.deleteMany({
      where: { id: { in: codingIds }, testId: input.testId },
    });
  }

  const createdIds: string[] = [];
  for (const q of input.codingQuestions) {
    if (!isFacultyCodingQuestion(q)) continue;
    const row = examQuestionToDbRow(q, {
      testId: input.testId,
      tags: [CODING_UPLOAD_TAG, JAVA_TODAY_SLOT_KEY],
    });
    const created = await prisma.question.create({
      data: {
        id: String(row.id),
        testId: input.testId,
        questionText: String(row.question_text),
        questionType: 'coding',
        type: 'CODING',
        difficulty: String(row.difficulty ?? 'medium'),
        correctAnswer: String(row.correct_answer ?? ''),
        explanation: String(row.explanation ?? ''),
        tags: (row.tags ?? []) as Prisma.InputJsonValue,
        marks: 20,
      },
      select: { id: true },
    });
    createdIds.push(created.id);
  }

  const orderedIds = [...mcqIds, ...createdIds];
  await prisma.testQuestion.deleteMany({ where: { testId: input.testId } });
  if (orderedIds.length) {
    await prisma.testQuestion.createMany({
      data: orderedIds.map((questionId, index) => ({
        testId: input.testId,
        questionId,
        sortOrder: index + 1,
      })),
    });
  }

  invalidateQuestionScoreCache(input.testId);
}

export async function publishJavaTodayExam(input: {
  adminUserId: string;
  allowRewrite?: boolean;
}): Promise<JavaTodayExamResult> {
  const admin = getDbService();
  const title = javaTodayExamTitle();
  const existing = await findExistingJavaTodayRequest();
  const codingQuestions = await loadUploadedJavaCodingQuestions();

  let requestId = existing?.id ?? '';
  let testId = existing?.publishedTestId ?? '';
  let mcqQuestions: FacultyExamQuestion[] = [];

  if (!existing?.publishedTestId) {
    const drawnMcq = await drawExamQuestionsFromTopics(admin, {
      testType: 'technical',
      topicIds: ['technical-java'],
      questionsPerTopic: JAVA_TODAY_POOL_MCQ,
      slotKey: `${JAVA_TODAY_SLOT_KEY}-mcq`,
      createdBy: input.adminUserId,
    });
    mcqQuestions = drawnMcq.questions.map((q) => ({
      ...q,
      pro_subject: 'Java',
      pro_subject_slug: 'java',
      pro_topic_slug: 'technical-java',
    }));
    if (mcqQuestions.length < JAVA_TODAY_MCQ_COUNT) {
      throw new Error(
        `Need at least ${JAVA_TODAY_MCQ_COUNT} Java MCQs in the technical-java bank (found ${mcqQuestions.length}). Upload Java MCQs first.`,
      );
    }

    const created = await createFacultyExamRequestRecord(admin, {
      creatorUserId: input.adminUserId,
      primaryDepartment: 'Computer Science Engineering',
      extraBranches: [...DEPARTMENTS],
      title,
      description: javaTodayDescription(),
      topic: JAVA_TODAY_SLOT_KEY,
      targetYears: [...ACADEMIC_YEARS],
      durationMinutes: JAVA_TODAY_DURATION_MINUTES,
      questions: [...mcqQuestions, ...codingQuestions],
      testType: 'technical',
      slotKey: JAVA_TODAY_SLOT_KEY,
      questionsPerTopic: JAVA_TODAY_MCQ_COUNT,
      status: 'approved',
      autoPublish: true,
      autoGoLive: true,
      goLiveNotice: JAVA_TODAY_NOTICE,
    });

    if (!created.testId || !created.scheduleId) {
      throw new Error('Java exam was saved but did not go live. Check exam schedules.');
    }
    requestId = created.requestId;
    testId = created.testId;

    await prisma.test
      .update({
        where: { id: testId },
        data: {
          totalQuestions: JAVA_TODAY_MCQ_COUNT + 2,
          durationMinutes: JAVA_TODAY_DURATION_MINUTES,
          duration: JAVA_TODAY_DURATION_MINUTES,
          description: javaTodayDescription(),
        },
      })
      .catch(() => undefined);

    invalidateQuestionScoreCache(testId);
  } else {
    const existingQs = parseQuestionsJson(existing.questionsJson);
    mcqQuestions = existingQs.filter((q) => !isFacultyCodingQuestion(q));
    await replacePublishedCodingQuestions({
      requestId: existing.id,
      testId: existing.publishedTestId,
      codingQuestions,
      mcqQuestions,
    });
  }

  let schedule = await latestScheduleForRequest(requestId, testId);
  if (!schedule) {
    throw new Error('Java exam exists but has no schedule. Create one from Live & upcoming exams.');
  }

  if (schedule.status !== 'live') {
    await goLiveExamScheduleNow(admin, schedule.id, { openWindowNow: true });
    schedule = (await prisma.examSchedule.findUnique({ where: { id: schedule.id } })) ?? schedule;
  }

  const completedCount = await prisma.testAttempt.count({
    where: {
      testId,
      status: { in: ['completed', 'submitted'] },
      completedAt: { not: null },
    },
  });

  let retakeOpened = false;
  const shouldRewrite = Boolean(input.allowRewrite) || completedCount > 0;
  if (shouldRewrite && existing?.publishedTestId) {
    const opened = await openNextAttemptRoundForSchedule({
      scheduleId: schedule.id,
      adminUserId: input.adminUserId,
      goLiveNow: true,
    });
    schedule = await prisma.examSchedule.findUniqueOrThrow({ where: { id: opened.schedule.id } });
    retakeOpened = true;
  }

  const attemptRound = schedule.attemptRound ?? 1;
  const message = retakeOpened
    ? `New sitting is live (attempt ${attemptRound}). Coding is from the uploaded document only (${codingQuestions.length} problems). Students who already submitted can write again.`
    : `Java exam is live. Each student gets 15 MCQs and 2 unique coding questions from the uploaded document (${codingQuestions.length} in the pool). Total ${JAVA_TODAY_TOTAL_MARKS} marks.`;

  return {
    requestId,
    testId,
    scheduleId: schedule.id,
    title: schedule.title ?? title,
    mcqPool: mcqQuestions.length || JAVA_TODAY_POOL_MCQ,
    codingPool: codingQuestions.length,
    studentPaper: `15 MCQs + 2 unique coding from uploaded document (${codingQuestions.length} problems)`,
    totalMarks: JAVA_TODAY_TOTAL_MARKS,
    retakeOpened,
    attemptRound,
    message,
  };
}
