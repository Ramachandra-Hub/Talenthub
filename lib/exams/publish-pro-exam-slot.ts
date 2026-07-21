import type { DbServiceClient } from '@/lib/db/get-db-service';
import { prisma } from '@/lib/prisma';
import {
  combineDateAndTime,
  createScheduleForSlot,
  goLiveExamScheduleNow,
  parseScheduleSlotsJson,
  persistSlotRosterForSlot,
  syncExamStudentRosters,
  validateSingleScheduleSlot,
  type ExamScheduleSlotInput,
} from '@/lib/exam-schedule-slots';
import { enrichSlotsWithPasswords } from '@/lib/roster-credentials-export';
import {
  assertRosterProvisionSucceeded,
  provisionStudentsFromSlotRoster,
} from '@/lib/roster-student-provision';

export type PublishedProExamSlot = {
  slot_number: number;
  schedule_id: string;
  status: string;
};

export async function listPublishedProExamSlots(
  examId: string,
): Promise<PublishedProExamSlot[]> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { facultyExamRequestId: true },
  });
  if (!exam?.facultyExamRequestId) return [];

  const rows = await prisma.examSchedule.findMany({
    where: { facultyExamRequestId: exam.facultyExamRequestId, attemptRound: 1 },
    select: { id: true, slotNumber: true, status: true },
    orderBy: { slotNumber: 'asc' },
  });

  return rows
    .filter((row) => row.slotNumber != null)
    .map((row) => ({
      slot_number: row.slotNumber!,
      schedule_id: row.id,
      status: row.status,
    }));
}

export async function publishProExamSlot(
  admin: DbServiceClient,
  input: {
    examId: string;
    adminUserId: string;
    slot: ExamScheduleSlotInput;
  },
): Promise<{ scheduleId: string; slotNumber: number }> {
  const validationError = validateSingleScheduleSlot(input.slot);
  if (validationError) throw new Error(validationError);

  const exam = await prisma.exam.findUnique({
    where: { id: input.examId },
    select: {
      facultyExamRequestId: true,
      publishedTestId: true,
    },
  });
  if (!exam?.facultyExamRequestId || !exam.publishedTestId) {
    throw new Error('Publish Slot 1 and the exam first.');
  }

  const existingSchedule = await prisma.examSchedule.findFirst({
    where: {
      facultyExamRequestId: exam.facultyExamRequestId,
      slotNumber: input.slot.slot_number,
      attemptRound: 1,
    },
    select: { id: true },
  });
  if (existingSchedule) {
    throw new Error(`Slot ${input.slot.slot_number} is already published.`);
  }

  const { data: request, error: requestError } = await admin
    .from('faculty_exam_requests')
    .select(
      'id, title, description, department, target_years, target_branches, schedule_slots_json',
    )
    .eq('id', exam.facultyExamRequestId)
    .maybeSingle();
  if (requestError || !request) throw new Error('Published exam request not found.');

  const enrichedSlot = enrichSlotsWithPasswords([input.slot])[0]!;
  const savedSlots = parseScheduleSlotsJson(request.schedule_slots_json);
  const mergedSlots = savedSlots.filter(
    (slot) => slot.slot_number !== enrichedSlot.slot_number,
  );
  mergedSlots.push(enrichedSlot);
  mergedSlots.sort((a, b) => a.slot_number - b.slot_number);

  const { error: updateError } = await admin
    .from('faculty_exam_requests')
    .update({
      schedule_slots_json: mergedSlots,
      uses_slot_scheduling: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', exam.facultyExamRequestId);
  if (updateError) throw new Error(updateError.message);

  await persistSlotRosterForSlot(admin, exam.facultyExamRequestId, enrichedSlot);

  const targetYears = Array.isArray(request.target_years)
    ? (request.target_years as string[])
    : [];
  const provision = await provisionStudentsFromSlotRoster(admin, {
    slots: [enrichedSlot],
    defaultDepartment: String(request.department ?? 'All departments'),
    defaultYears: targetYears,
  });
  assertRosterProvisionSucceeded(provision, enrichedSlot.roster.length);

  const targetBranches = Array.isArray(request.target_branches)
    ? (request.target_branches as string[])
    : [];
  const created = await createScheduleForSlot(admin, {
    requestId: exam.facultyExamRequestId,
    testId: exam.publishedTestId,
    title: String(request.title),
    description: (request.description as string | null) ?? null,
    targetDepartments: Array.from(
      new Set([String(request.department), ...targetBranches]),
    ),
    targetYears,
    createdBy: input.adminUserId,
    slot: enrichedSlot,
  });
  if (!created) throw new Error(`Could not publish Slot ${enrichedSlot.slot_number}.`);

  await syncExamStudentRosters(admin, [created], [enrichedSlot]);

  // Ensure configured times are persisted exactly even if a legacy insert fallback ran.
  await prisma.examSchedule.update({
    where: { id: created.scheduleId },
    data: {
      startsAt: new Date(
        combineDateAndTime(enrichedSlot.exam_date, enrichedSlot.start_time),
      ),
      endsAt: new Date(
        combineDateAndTime(enrichedSlot.exam_date, enrichedSlot.end_time),
      ),
      status: 'scheduled',
    },
  });
  await goLiveExamScheduleNow(admin, created.scheduleId, { openWindowNow: false });

  return {
    scheduleId: created.scheduleId,
    slotNumber: enrichedSlot.slot_number,
  };
}
