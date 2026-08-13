import type { DbServiceClient } from '@/lib/db/get-db-service';
import { prisma } from '@/lib/prisma';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { createFacultyExamRequestRecord } from '@/lib/exam-builder/create-exam-request';
import { getExamDetails } from '@/lib/exams/exam-builder-service';
import { drawQuestionsForProExam } from '@/lib/exams/draw-questions-for-exam';
import {
  parseScheduleSlotsJson,
  filterConfiguredScheduleSlots,
  goLiveExamScheduleNow,
  scheduleWindowFromConfiguredSlots,
} from '@/lib/exam-schedule-slots';
import { syncElevateXEvaloraModuleFromSchedule } from '@/lib/elevatex-admin';
import {
  ELEVATEX_PLACEHOLDER_QUESTIONS,
  isElevateXBuilderTestType,
  studentTakeUrlForTestId,
} from '@/lib/exam-builder/elevatex-exam';
import {
  mergeElevateXExamConfig,
  serializeElevateXExamConfig,
} from '@/lib/placement/elevatex-exam-config';
import { loadCodingBankFromDb } from '@/lib/coding/coding-bank-store';
import { isProgrammingLanguageSubject } from '@/lib/exams/programming-subjects';
import {
  createProExamTestSections,
  sectionPlansFromBlocks,
} from '@/lib/exams/create-pro-exam-sections';
import { parseSubjectRubricConfig } from '@/lib/exams/pro-exam-rubric';
import { newOpenLinkToken, openJoinPath, resolveOpenLinkPassword } from '@/lib/exams/open-exam-link';
import { ACADEMIC_YEARS, DEPARTMENTS } from '@/lib/college-brand';

export type PublishProExamInput = {
  examId: string;
  creatorUserId: string;
  primaryDepartment: string;
  departmentGroupId?: string | null;
  targetYears: string[];
  usesSlotScheduling: boolean;
  scheduleSlots?: unknown;
  questionsPerSubject?: number;
  codingProblemsPerSubject?: number;
  openLinkEnabled?: boolean;
};

export type PublishProExamResult = {
  requestId: string;
  testId?: string;
  scheduleId?: string;
  takeUrl?: string;
  openLinkPath?: string;
  openLinkPassword?: string;
  warnings: string[];
};

function isElevateXStyleProExam(
  subjects: { slug: string; subject_name: string; assessment_format?: string }[],
): boolean {
  if (subjects.length !== 1) return false;
  const s = subjects[0];
  const programming = isProgrammingLanguageSubject({
    slug: s.slug,
    subject_name: s.subject_name,
  });
  if (!programming) return false;
  return String(s.assessment_format ?? 'mcq') === 'both';
}

async function ensureExamScheduleWindow(
  admin: DbServiceClient,
  input: {
    requestId: string;
    testId: string;
    title: string;
    description: string | null;
    creatorUserId: string;
    targetYears: string[];
    targetDepartments: string[];
    startsAt: Date;
    endsAt: Date;
  },
): Promise<string | undefined> {
  const now = Date.now();
  const status =
    now >= input.startsAt.getTime() && now <= input.endsAt.getTime() ? 'live' : 'scheduled';

  const { data: schedule, error } = await admin
    .from('exam_schedules')
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      faculty_exam_request_id: input.requestId,
      test_id: input.testId,
      status,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      target_departments: input.targetDepartments,
      target_years: input.targetYears,
      slot_number: 1,
      attempt_round: 1,
      created_by: input.creatorUserId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return schedule?.id as string | undefined;
}

export async function publishProExam(
  admin: DbServiceClient,
  input: PublishProExamInput,
): Promise<PublishProExamResult> {
  const exam = await getExamDetails(input.examId);
  if (!exam) throw new Error('Exam not found');
  if (exam.subjects.length === 0) throw new Error('Add at least one subject before publishing.');
  if (!input.targetYears.length) throw new Error('Select at least one target year.');
  if (!input.primaryDepartment?.trim() && !input.departmentGroupId) {
    throw new Error('Choose a primary department or department group.');
  }

  const existing = await prisma.exam.findUnique({
    where: { id: input.examId },
    select: { facultyExamRequestId: true, publishedTestId: true },
  });
  if (existing?.facultyExamRequestId && existing?.publishedTestId) {
    throw new Error('This exam is already published. Create a new exam to schedule again.');
  }

  const questionsPerSubject = Math.min(Math.max(input.questionsPerSubject ?? 5, 1), 30);
  const codingProblemsPerSubject = Math.min(Math.max(input.codingProblemsPerSubject ?? 3, 1), 10);
  const useElevateX = isElevateXStyleProExam(exam.subjects);
  const testType = useElevateX ? 'elevatex' : 'rmset';
  const slotKey = `pro-${input.examId.slice(0, 8)}`;

  const warnings: string[] = [];
  let questions: FacultyExamQuestion[] = ELEVATEX_PLACEHOLDER_QUESTIONS;
  let topicSlugs: string[] = ['technical-c-language'];
  let elevateXTopic: string | null = null;
  let subjectBlocks: ProExamSubjectBlock[] = [];

  if (!useElevateX) {
    const examSubjectRows = await prisma.examSubject.findMany({
      where: { examId: input.examId },
      include: { subject: { select: { id: true, subjectName: true, slug: true } } },
    });
    const rubricBySubjectId = new Map(
      examSubjectRows.map((row) => [row.subjectId, parseSubjectRubricConfig(row.rubricConfig)]),
    );

    const drawn = await drawQuestionsForProExam(admin, {
      subjects: exam.subjects.map((s) => ({
        subjectId: s.id,
        subjectName: s.subject_name,
        slug: s.slug,
        assessmentFormat: s.assessment_format ?? 'mcq',
        rubric: rubricBySubjectId.get(s.id) ?? null,
      })),
      questionsPerSubject,
      codingProblemsPerSubject,
      testType,
      slotKey,
      createdBy: input.creatorUserId,
    });
    warnings.push(...drawn.warnings);
    topicSlugs = drawn.topicSlugs;
    subjectBlocks = drawn.subjectBlocks;
    questions = drawn.questions;
  } else {
    const programmingProblems = await loadCodingBankFromDb({ language: 'c', limit: 3 });
    const config = mergeElevateXExamConfig({
      enabledSections: ['technical', 'programming'],
      programmingProblems,
      programmingDefaultLanguage: 'c',
    });
    elevateXTopic = serializeElevateXExamConfig(config);
  }

  const openLinkEnabled = Boolean(input.openLinkEnabled);
  const usesSlotScheduling = openLinkEnabled ? false : Boolean(input.usesSlotScheduling);
  const parsedSlots = usesSlotScheduling ? parseScheduleSlotsJson(input.scheduleSlots) : [];
  // Initial publish creates Slot 1 only. Slots 2–8 are published independently later.
  const scheduleSlots = usesSlotScheduling
    ? parsedSlots.filter((slot) => slot.slot_number === 1)
    : undefined;

  const created = await createFacultyExamRequestRecord(admin, {
    creatorUserId: input.creatorUserId,
    primaryDepartment: input.primaryDepartment.trim(),
    departmentGroupId: input.departmentGroupId ?? null,
    extraBranches: openLinkEnabled ? [...DEPARTMENTS] : undefined,
    title: exam.title,
    description: exam.description,
    topic: elevateXTopic ?? exam.title,
    targetYears: openLinkEnabled ? [...ACADEMIC_YEARS] : input.targetYears,
    durationMinutes: exam.duration,
    questions,
    testType,
    slotKey,
    syllabusTopicIds: topicSlugs,
    questionsPerTopic: questionsPerSubject,
    status: 'approved',
    autoPublish: true,
    autoGoLive: false,
    usesSlotScheduling,
    scheduleSlots,
    incrementalSlotPublishing: usesSlotScheduling,
  });

  let scheduleId = created.scheduleId;

  if (created.testId) {
    if (!useElevateX && subjectBlocks.length) {
      try {
        await createProExamTestSections(admin, {
          testId: created.testId,
          examDurationMinutes: exam.duration,
          sections: sectionPlansFromBlocks(subjectBlocks),
        });
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : 'Could not create subject sections');
      }
    }

    try {
      if (usesSlotScheduling) {
        const firstSlotSchedule = await prisma.examSchedule.findFirst({
          where: {
            facultyExamRequestId: created.requestId,
            slotNumber: 1,
            attemptRound: 1,
          },
          select: { id: true },
        });
        if (firstSlotSchedule) {
          await goLiveExamScheduleNow(admin, firstSlotSchedule.id, {
            openWindowNow: false,
          });
          scheduleId = firstSlotSchedule.id;
        }
      } else {
        scheduleId = await ensureExamScheduleWindow(admin, {
          requestId: created.requestId,
          testId: created.testId,
          title: exam.title,
          description: exam.description,
          creatorUserId: input.creatorUserId,
          targetYears: input.targetYears,
          targetDepartments: openLinkEnabled
            ? [...DEPARTMENTS]
            : Array.from(new Set([created.department, ...created.target_branches])),
          startsAt: new Date(exam.start_time),
          endsAt: new Date(exam.end_time),
        });
      }
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : 'Schedule go-live warning');
    }

    if (isElevateXBuilderTestType(testType) && scheduleSlots?.length) {
      try {
        const configured = filterConfiguredScheduleSlots(scheduleSlots);
        if (configured.length) {
          const window = scheduleWindowFromConfiguredSlots(configured);
          await syncElevateXEvaloraModuleFromSchedule(
            admin,
            { ...window, notice: `${exam.title} · scheduled from Exam Builder` },
            input.creatorUserId,
          );
        }
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : 'ElevateX module sync warning');
      }
    }
  }

  const openLinkToken = openLinkEnabled ? newOpenLinkToken() : null;
  const openLinkPassword = openLinkEnabled ? resolveOpenLinkPassword(null) : null;

  await prisma.exam.update({
    where: { id: input.examId },
    data: {
      status: 'published',
      facultyExamRequestId: created.requestId,
      publishedTestId: created.testId ?? null,
      openLinkEnabled,
      openLinkToken,
      openLinkPassword,
    },
  });

  const takeUrl = useElevateX
    ? '/placement/assessment'
    : created.testId
      ? studentTakeUrlForTestId(created.testId)
      : undefined;

  return {
    requestId: created.requestId,
    testId: created.testId,
    scheduleId,
    takeUrl,
    openLinkPath: openLinkToken ? openJoinPath(openLinkToken) : undefined,
    openLinkPassword: openLinkPassword ?? undefined,
    warnings,
  };
}
