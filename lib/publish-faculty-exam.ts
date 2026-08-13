import { randomUUID } from 'crypto';
import type { DbServiceClient } from '@/lib/db/get-db-service';
import { dbRowTimestamps } from '@/lib/db/row-timestamps';
import { linkTestQuestions } from '@/lib/exam-builder/link-test-questions';
import {
  isElevateXBuilderTestType,
  ELEVATEX_TEST_ID,
} from '@/lib/exam-builder/elevatex-exam';
import {
  detectQuestionsIdKind,
  detectTestsIdKind,
  isUuidTypeMismatchError,
  normalizeTestId,
} from '@/lib/exam-builder/id-utils';
import { isFacultyCodingQuestion } from '@/lib/exam-builder/programming-syllabus';
import { questionTagsFromProMetadata } from '@/lib/exam-v2/subject-progress';
import { parseQuestionsJson, type FacultyExamQuestion, type FacultyMcqQuestion } from '@/lib/faculty-exams';
import {
  createSchedulesFromSlots,
  filterConfiguredScheduleSlots,
  parseScheduleSlotsJson,
  rebuildSlotsFromRosterEntries,
  syncExamStudentRosters,
} from '@/lib/exam-schedule-slots';
import {
  assertRosterProvisionSucceeded,
  provisionStudentsFromSlotRoster,
} from '@/lib/roster-student-provision';
import { enrichSlotsWithPasswords } from '@/lib/roster-credentials-export';
import { ensureTestCategory } from '@/lib/tests/ensure-test-category';
import { insertTestRow } from '@/lib/tests/insert-test';

const DEPT_EXAMS_SLUG = 'department-exams';

async function ensureDepartmentExamsCategory(admin: DbServiceClient): Promise<string> {
  return ensureTestCategory(admin, {
    slug: DEPT_EXAMS_SLUG,
    name: 'Department Exams',
    description: 'Department examinations created by the examination cell',
    icon: '🏫',
  });
}

async function finalizeSlotSchedulesOnPublish(
  admin: DbServiceClient,
  request: Record<string, unknown>,
  requestId: string,
  testIdStr: string,
  adminUserId: string,
): Promise<void> {
  const usesSlotScheduling = Boolean(request.uses_slot_scheduling);
  if (!usesSlotScheduling) return;

  const scheduleMeta = parseScheduleSlotsJson(request.schedule_slots_json);
  let slots = scheduleMeta;
  if (slots.length === 0 || slots.some((slot) => slot.roster.length === 0)) {
    const rebuilt = await rebuildSlotsFromRosterEntries(admin, requestId, scheduleMeta);
    if (rebuilt.length > 0) {
      if (slots.length === 0) {
        slots = rebuilt;
      } else {
        slots = slots.map((slot) => {
          const rebuiltSlot = rebuilt.find((row) => row.slot_number === slot.slot_number);
          if (!rebuiltSlot?.roster.length) return slot;
          return {
            ...slot,
            roster: slot.roster.length > 0 ? slot.roster : rebuiltSlot.roster,
          };
        });
      }
    }
  }

  if (slots.length === 0) return;

  slots = filterConfiguredScheduleSlots(slots);
  if (slots.length === 0) return;

  slots = enrichSlotsWithPasswords(slots);

  const targetDepartments = Array.from(
    new Set([String(request.department), ...((request.target_branches as string[]) ?? [])]),
  );

  const rosterStudents = slots.reduce((n, slot) => n + slot.roster.length, 0);
  if (rosterStudents > 0) {
    try {
      const provision = await provisionStudentsFromSlotRoster(admin, {
        slots,
        defaultDepartment: String(request.department),
        defaultYears: (request.target_years as string[]) ?? [],
      });
      assertRosterProvisionSucceeded(provision, rosterStudents);
    } catch (provisionErr) {
      console.error('[publishFacultyExamRequest] roster provision:', provisionErr);
      if (process.env.EXAM_REQUIRE_ROSTER_PROVISION === 'true') {
        throw provisionErr;
      }
    }
  }

  const { data: existingSchedules } = await admin
    .from('exam_schedules')
    .select('id, slot_number')
    .eq('faculty_exam_request_id', requestId);

  const existingBySlot = new Map<number, string>();
  for (const row of existingSchedules ?? []) {
    const slotNum = Number(row.slot_number);
    if (Number.isFinite(slotNum) && row.id) {
      existingBySlot.set(slotNum, String(row.id));
    }
  }

  let schedules: Array<{ scheduleId: string; slot_number: number }>;
  if ((existingSchedules ?? []).length > 0) {
    schedules = slots
      .map((slot) => {
        const scheduleId = existingBySlot.get(slot.slot_number);
        return scheduleId ? { scheduleId, slot_number: slot.slot_number } : null;
      })
      .filter((row): row is { scheduleId: string; slot_number: number } => row != null);
  } else {
    schedules = await createSchedulesFromSlots(admin, {
      requestId,
      testId: testIdStr,
      title: String(request.title),
      description: (request.description as string | null) ?? null,
      targetDepartments,
      targetYears: (request.target_years as string[]) ?? [],
      createdBy: adminUserId,
      slots,
    });
  }

  if (schedules.length > 0) {
    await syncExamStudentRosters(admin, schedules, slots);
  }
}

export async function publishFacultyExamRequest(
  admin: DbServiceClient,
  requestId: string,
  adminUserId: string,
): Promise<{ testId: string }> {
  const { data: request, error: fetchError } = await admin
    .from('faculty_exam_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!request) throw new Error('Exam request not found');
  if (request.status === 'approved' && request.published_test_id) {
    const testIdStr = String(request.published_test_id);
    await finalizeSlotSchedulesOnPublish(admin, request, requestId, testIdStr, adminUserId);
    return { testId: testIdStr };
  }

  const canPublishFresh =
    request.status === 'pending' ||
    (request.status === 'approved' && !request.published_test_id);

  if (!canPublishFresh) {
    throw new Error(`Exam request cannot be published (status: ${request.status})`);
  }

  const isElevateX = isElevateXBuilderTestType(String(request.test_type ?? ''));

  if (isElevateX) {
    const approvedBase = {
      status: 'approved',
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_test_id: ELEVATEX_TEST_ID,
    };

    const { error: updateError } = await admin
      .from('faculty_exam_requests')
      .update(approvedBase)
      .eq('id', requestId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await finalizeSlotSchedulesOnPublish(admin, request, requestId, ELEVATEX_TEST_ID, adminUserId);
    return { testId: ELEVATEX_TEST_ID };
  }

  const questions = parseQuestionsJson(request.questions_json) as FacultyExamQuestion[];
  if (questions.length === 0) {
    throw new Error('Exam has no questions');
  }

  const categoryId = await ensureDepartmentExamsCategory(admin);

  const { testId: testIdStr, rawId: testId } = await insertTestRow(admin, {
    categoryId,
    title: String(request.title),
    description: String(request.description ?? `Department: ${request.department}`),
    durationMinutes: Number(request.duration_minutes),
    totalQuestions: questions.length,
    difficulty: 'medium',
  });

  const testsIdKind = await detectTestsIdKind(admin);
  const questionsIdKind = await detectQuestionsIdKind(admin);

  const mcqQuestions = questions.filter((q): q is FacultyMcqQuestion => !isFacultyCodingQuestion(q));

  const questionRows = mcqQuestions.map((q) => {
    const proTags = questionTagsFromProMetadata(q);
    const row: Record<string, unknown> = {
      id: randomUUID(),
      ...dbRowTimestamps(),
      question_text: q.question_text,
      question_type: 'mcq',
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation ?? '',
      marks: 1,
      test_id: testsIdKind === 'bigint' ? Number(testIdStr) : testId,
    };
    if (proTags.length) row.tags = proTags;
    return row;
  });

  let { data: inserted, error: qError } = await admin
    .from('questions')
    .insert(questionRows)
    .select('id');

  if (qError && isUuidTypeMismatchError(String(qError.message ?? ''))) {
    const fallbackRows = questionRows.map((r) => {
      const { test_id: _t, ...rest } = r;
      return rest;
    });
    const retry = await admin.from('questions').insert(fallbackRows).select('id');
    inserted = retry.data;
    qError = retry.error;
  }

  if (qError) throw new Error(qError.message);

  if (inserted?.length) {
    await linkTestQuestions(admin, testIdStr, inserted as Array<{ id: unknown }>);
  }

  const approvedBase = {
    status: 'approved',
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const publishedCandidates: Array<string | number> = [
    testId,
    testIdStr,
    ...(testsIdKind === 'bigint' ? [Number(testIdStr)] : []),
  ];

  let updateError: { message: string } | null = null;
  for (const publishedTestId of publishedCandidates) {
    const { error } = await admin
      .from('faculty_exam_requests')
      .update({ ...approvedBase, published_test_id: publishedTestId })
      .eq('id', requestId);
    if (!error) {
      await finalizeSlotSchedulesOnPublish(admin, request, requestId, testIdStr, adminUserId);
      return { testId: testIdStr };
    }
    updateError = error;
    if (!isUuidTypeMismatchError(String(error.message ?? ''))) {
      throw new Error(error.message);
    }
  }

  const { error: fallbackUpdateError } = await admin
    .from('faculty_exam_requests')
    .update({ ...approvedBase, published_test_id: testIdStr })
    .eq('id', requestId);

  if (!fallbackUpdateError) {
    await finalizeSlotSchedulesOnPublish(admin, request, requestId, testIdStr, adminUserId);
    return { testId: testIdStr };
  }

  const { error: statusOnlyError } = await admin
    .from('faculty_exam_requests')
    .update(approvedBase)
    .eq('id', requestId);

  if (statusOnlyError) {
    throw new Error(
      updateError?.message ??
        fallbackUpdateError.message ??
        statusOnlyError.message ??
        'Could not mark exam as approved',
    );
  }

  await finalizeSlotSchedulesOnPublish(admin, request, requestId, testIdStr, adminUserId);
  return { testId: testIdStr };
}
