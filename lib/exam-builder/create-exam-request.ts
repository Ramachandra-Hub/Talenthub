import type { Prisma } from '@prisma/client';
import type { DbServiceClient } from '@/lib/db/get-db-service';
import type { FacultyExamQuestion } from '@/lib/faculty-exams';
import { prisma } from '@/lib/prisma';
import { augmentExamQuestionsWithCoding } from '@/lib/exam-builder/programming-syllabus';
import { resolveSyllabusTopicsForBuilder } from '@/lib/exam-builder/draw-questions';
import { looksLikeUuid } from '@/lib/exam-builder/id-utils';
import { getGroupDepartments, resolveExamBranchTargeting } from '@/lib/department-groups';
import { publishFacultyExamRequest } from '@/lib/publish-faculty-exam';
import {
  persistSlotRoster,
  validateScheduleSlots,
  validateElevateXPublishSlots,
  validateOptionalConfiguredSlots,
  goLiveAllConfiguredSlotSchedules,
  type ExamScheduleSlotInput,
} from '@/lib/exam-schedule-slots';
import {
  ELEVATEX_PLACEHOLDER_QUESTIONS,
  isElevateXBuilderTestType,
} from '@/lib/exam-builder/elevatex-exam';
import { enrichSlotsWithPasswords } from '@/lib/roster-credentials-export';

export type CreateExamRequestInput = {
  creatorUserId: string;
  primaryDepartment: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  targetYears: string[];
  extraBranches?: string[];
  departmentGroupId?: string | null;
  durationMinutes: number;
  questions: FacultyExamQuestion[];
  testType?: string | null;
  slotKey?: string | null;
  syllabusTopicIds?: string[];
  questionsPerTopic?: number | null;
  status: 'approved';
  autoPublish?: boolean;
  autoGoLive?: boolean;
  goLiveNotice?: string | null;
  usesSlotScheduling?: boolean;
  scheduleSlots?: ExamScheduleSlotInput[];
  /** Slot numbers (1–8) to mark live immediately after publish. */
  goLiveSlotNumbers?: number[];
};

export type CreateExamRequestResult = {
  requestId: string;
  testId?: string;
  scheduleId?: string;
  department: string;
  target_branches: string[];
};

export async function createFacultyExamRequestRecord(
  admin: DbServiceClient,
  input: CreateExamRequestInput,
): Promise<CreateExamRequestResult> {
  const isElevateX = isElevateXBuilderTestType(input.testType);

  if (isElevateX) {
    if (!input.usesSlotScheduling || !input.scheduleSlots?.length) {
      throw new Error('ElevateX requires slot scheduling with Slot 1 date, time, and student roster.');
    }
  } else if (!input.questions.length) {
    throw new Error('Add at least one MCQ question');
  }
  if (!input.targetYears.length) {
    throw new Error('Select at least one target year');
  }
  if (input.usesSlotScheduling && input.scheduleSlots?.length) {
    if (isElevateX) {
      const slotErr =
        validateElevateXPublishSlots(input.scheduleSlots) ??
        validateOptionalConfiguredSlots(input.scheduleSlots);
      if (slotErr) throw new Error(slotErr);
    } else {
      const slotErr = validateScheduleSlots(input.scheduleSlots);
      if (slotErr) throw new Error(slotErr);
    }
  }

  const groupDepartments = await getGroupDepartments(admin, input.departmentGroupId);
  const { department, target_branches } = resolveExamBranchTargeting({
    primaryDepartment: input.primaryDepartment,
    departmentGroupId: input.departmentGroupId,
    groupDepartments,
    extraBranches: input.extraBranches,
  });

  if (!department) {
    throw new Error('Set a primary department or choose a department group');
  }

  let syllabusTopicUuids: string[] = [];
  let syllabusTopicSlugs: string[] = [];
  if (input.syllabusTopicIds?.length) {
    const resolved = await resolveSyllabusTopicsForBuilder(admin, input.syllabusTopicIds);
    syllabusTopicUuids = resolved.map((t) => t.id).filter(looksLikeUuid);
    syllabusTopicSlugs = resolved.map((t) => t.slug);
    if (!syllabusTopicUuids.length && input.syllabusTopicIds.length) {
      throw new Error('Could not resolve syllabus topics to tag UUIDs. Re-select topics and try again.');
    }
  }

  const examQuestions = isElevateX
    ? ELEVATEX_PLACEHOLDER_QUESTIONS
    : augmentExamQuestionsWithCoding(
        input.questions,
        syllabusTopicSlugs.length ? syllabusTopicSlugs : input.syllabusTopicIds ?? [],
        input.testType,
      );

  const insertPayload: Record<string, unknown> = {
    faculty_user_id: input.creatorUserId,
    department,
    topic: input.topic?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    target_years: input.targetYears,
    target_branches,
    duration_minutes: input.durationMinutes,
    questions_json: examQuestions,
    status: input.status,
    test_type: input.testType?.trim() || null,
    slot_key: input.slotKey?.trim() || null,
    syllabus_topic_ids: syllabusTopicUuids,
    questions_per_topic: input.questionsPerTopic ?? null,
  };

  const groupId =
    input.departmentGroupId && looksLikeUuid(input.departmentGroupId)
      ? input.departmentGroupId
      : null;
  if (groupId) {
    insertPayload.department_group_id = groupId;
  }

  let scheduleSlotsForDb = input.scheduleSlots;
  if (input.usesSlotScheduling && scheduleSlotsForDb?.length) {
    scheduleSlotsForDb = enrichSlotsWithPasswords(scheduleSlotsForDb);
  }

  if (input.usesSlotScheduling) {
    insertPayload.uses_slot_scheduling = true;
    if (scheduleSlotsForDb?.length) {
      insertPayload.schedule_slots_json = scheduleSlotsForDb;
    }
  }

  let requestId: string;

  try {
    const created = await prisma.facultyExamRequest.create({
      data: {
        facultyUserId: input.creatorUserId,
        department,
        topic: input.topic?.trim() || null,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        targetYears: input.targetYears as Prisma.InputJsonValue,
        targetBranches: target_branches as Prisma.InputJsonValue,
        durationMinutes: input.durationMinutes,
        questionsJson: examQuestions as Prisma.InputJsonValue,
        status: input.status,
        testType: input.testType?.trim() || null,
        slotKey: input.slotKey?.trim() || null,
        syllabusTopicIds: syllabusTopicUuids as Prisma.InputJsonValue,
        questionsPerTopic: input.questionsPerTopic ?? null,
        usesSlotScheduling: Boolean(input.usesSlotScheduling),
        scheduleSlotsJson: scheduleSlotsForDb?.length
          ? (scheduleSlotsForDb as unknown as Prisma.InputJsonValue)
          : undefined,
        departmentGroupId: groupId,
      },
      select: { id: true },
    });
    requestId = created.id;
  } catch (prismaErr) {
    const stripOptionalColumns = (payload: Record<string, unknown>, columns: string[]) => {
      for (const col of columns) delete payload[col];
    };

    let { data: row, error } = await admin
      .from('faculty_exam_requests')
      .insert(insertPayload)
      .select('id')
      .single();

    if (
      error?.message?.includes('department_group_id') &&
      (error.message.includes('schema cache') || error.message.includes('does not exist'))
    ) {
      stripOptionalColumns(insertPayload, ['department_group_id']);
      const retry = await admin
        .from('faculty_exam_requests')
        .insert(insertPayload)
        .select('id')
        .single();
      row = retry.data;
      error = retry.error;
    }

    if (
      error &&
      (error.message.includes('uses_slot_scheduling') ||
        error.message.includes('schedule_slots_json'))
    ) {
      stripOptionalColumns(insertPayload, ['uses_slot_scheduling', 'schedule_slots_json']);
      const retry = await admin
        .from('faculty_exam_requests')
        .insert(insertPayload)
        .select('id')
        .single();
      row = retry.data;
      error = retry.error;
    }

    if (error || !row?.id) {
      const prismaMsg = prismaErr instanceof Error ? prismaErr.message : String(prismaErr);
      const hint = error?.message?.includes('department_group_id')
        ? `${error?.message ?? prismaMsg} — Run migration 023_faculty_department_group_id.sql in AWS RDS SQL editor, wait 30s, retry.`
        : (error?.message ?? prismaMsg ?? 'Could not save exam request');
      throw new Error(hint);
    }

    requestId = row.id as string;
  }

  if (input.usesSlotScheduling && scheduleSlotsForDb?.length) {
    try {
      await persistSlotRoster(admin, requestId, scheduleSlotsForDb);
    } catch (err) {
      console.warn('exam_slot_roster_entries persist skipped:', err);
    }
  }

  let testId: string | undefined;
  let scheduleId: string | undefined;

  if (input.autoPublish) {
    const published = await publishFacultyExamRequest(admin, requestId, input.creatorUserId);
    testId = published.testId;

    if (input.usesSlotScheduling && testId) {
      await goLiveAllConfiguredSlotSchedules(admin, requestId);
    }

    if (input.autoGoLive && testId && !input.usesSlotScheduling) {
      const targetDepartments = Array.from(new Set([department, ...target_branches]));
      const { data: schedule, error: scheduleErr } = await admin
        .from('exam_schedules')
        .insert({
          title: input.title.trim(),
          description: input.description?.trim() ?? null,
          notice: input.goLiveNotice ?? null,
          faculty_exam_request_id: requestId,
          test_id: testId,
          status: 'live',
          starts_at: new Date().toISOString(),
          ends_at: null,
          target_departments: targetDepartments,
          target_years: input.targetYears,
          created_by: input.creatorUserId,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (scheduleErr) {
        throw new Error(scheduleErr.message);
      }
      scheduleId = schedule?.id as string | undefined;
    }
  }

  return { requestId, testId, scheduleId, department, target_branches };
}
