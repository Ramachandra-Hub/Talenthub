import type { DbServiceClient } from '@/lib/db/get-db-service';
import { ELEVATEX_EXAM_NAME, ELEVATEX_MODULE_KEY, ELEVATEX_TEST_ID } from '@/lib/elevatex';
import { ELEVATEX_BUILDER_TEST_TYPE_ID } from '@/lib/exam-builder/elevatex-exam';
import { createFacultyExamRequestRecord } from '@/lib/exam-builder/create-exam-request';
import { publishFacultyExamRequest } from '@/lib/publish-faculty-exam';
import {
  combineDateAndTime,
  createScheduleForSlot,
  goLiveExamScheduleNow,
  parseScheduleSlotsJson,
  persistSlotRosterForSlot,
  scheduleSlotNumber,
  scheduleWindowFromConfiguredSlots,
  syncExamStudentRosters,
  type ExamScheduleSlotInput,
  validateElevateXPublishSlots,
  validateOptionalConfiguredSlots,
  validateSingleScheduleSlot,
  filterConfiguredScheduleSlots,
} from '@/lib/exam-schedule-slots';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import {
  assertRosterProvisionSucceeded,
  provisionStudentsFromSlotRoster,
  type RosterProvisionResult,
} from '@/lib/roster-student-provision';
import { enrichSlotsWithPasswords } from '@/lib/roster-credentials-export';
import {
  defaultElevateXTechnicalFormats,
  mergeElevateXTechnicalFormats,
  parseElevateXTechnicalConfig,
  resolveTechnicalFormatForDepartment,
  serializeElevateXTechnicalConfig,
  type ElevateXTechnicalFormatsMap,
} from '@/lib/placement/elevatex-technical-config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';

export type ElevateXAdminSlotStatus = {
  slot_number: number;
  roster_count: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  schedule_id: string | null;
  schedule_status: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type ElevateXAdminState = {
  published: boolean;
  requestId: string | null;
  testId: string;
  title: string;
  slots: ElevateXAdminSlotStatus[];
  scheduleSlots: ExamScheduleSlotInput[];
  /** Admin-only: technical section format per branch (students cannot change). */
  technicalFormats: ElevateXTechnicalFormatsMap;
};

export async function fetchElevateXAdminState(admin: DbServiceClient): Promise<ElevateXAdminState> {
  const { data: request } = await admin
    .from('faculty_exam_requests')
    .select('id, title, topic, published_test_id, schedule_slots_json, uses_slot_scheduling, status')
    .eq('test_type', ELEVATEX_BUILDER_TEST_TYPE_ID)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const requestId = request?.id ? String(request.id) : null;
  const scheduleSlots = parseScheduleSlotsJson(request?.schedule_slots_json);

  let examSchedules: ExamScheduleRow[] = [];
  if (requestId) {
    const { data } = await admin
      .from('exam_schedules')
      .select('*')
      .eq('faculty_exam_request_id', requestId);
    examSchedules = (data ?? []) as ExamScheduleRow[];
  }

  const slots: ElevateXAdminSlotStatus[] = Array.from({ length: 8 }, (_, i) => {
    const slotNumber = i + 1;
    const meta = scheduleSlots.find((s) => s.slot_number === slotNumber);
    const schedule = examSchedules.find((s) => scheduleSlotNumber(s) === slotNumber);
    return {
      slot_number: slotNumber,
      roster_count: meta?.roster.length ?? 0,
      exam_date: meta?.exam_date ?? '',
      start_time: meta?.start_time ?? '',
      end_time: meta?.end_time ?? '',
      schedule_id: schedule?.id ? String(schedule.id) : null,
      schedule_status: schedule?.status ?? null,
      starts_at: schedule?.starts_at ?? null,
      ends_at: schedule?.ends_at ?? null,
    };
  });

  const technicalFormats = mergeElevateXTechnicalFormats(
    parseElevateXTechnicalConfig(request?.topic as string | null | undefined),
  );

  return {
    published: Boolean(request?.published_test_id),
    requestId,
    testId: ELEVATEX_TEST_ID,
    title: String(request?.title ?? ELEVATEX_EXAM_NAME),
    technicalFormats,
    slots,
    scheduleSlots: scheduleSlots.length
      ? scheduleSlots
      : Array.from({ length: 8 }, (_, i) => ({
          slot_number: i + 1,
          exam_date: '',
          start_time: '09:00',
          end_time: '11:00',
          roster: [],
        })),
  };
}

/** Show ElevateX on the student portal for the full multi-slot event window. */
export async function syncElevateXEvaloraModuleFromConfiguredSlots(
  admin: DbServiceClient,
  slots: ExamScheduleSlotInput[],
  adminUserId: string,
  notice?: string | null,
): Promise<void> {
  const window = scheduleWindowFromConfiguredSlots(slots);
  await syncElevateXEvaloraModuleFromSchedule(
    admin,
    { ...window, notice: notice ?? null },
    adminUserId,
  );
}

/** Show ElevateX as LIVE on /placement when a slot is live. */
export async function syncElevateXEvaloraModuleFromSchedule(
  admin: DbServiceClient,
  schedule: Pick<ExamScheduleRow, 'starts_at' | 'ends_at' | 'notice'>,
  adminUserId: string,
): Promise<void> {
  const starts_at = schedule.starts_at ?? new Date().toISOString();
  const ends_at = schedule.ends_at ?? null;
  const now = new Date().toISOString();

  await admin
    .from('evalora_module_schedules')
    .update({ status: 'ended', updated_at: now })
    .eq('module_key', ELEVATEX_MODULE_KEY)
    .eq('status', 'live');

  await admin.from('evalora_module_schedules').insert({
    module_key: ELEVATEX_MODULE_KEY,
    title: ELEVATEX_EXAM_NAME,
    notice: schedule.notice ?? null,
    status: 'live',
    starts_at,
    ends_at,
    target_departments: [],
    target_years: [],
    created_by: adminUserId,
    updated_at: now,
  });
}

export async function publishElevateXFromAdmin(
  admin: DbServiceClient,
  input: {
    creatorUserId: string;
    title: string;
    description?: string;
    targetYears: string[];
    scheduleSlots: ExamScheduleSlotInput[];
    openSlot1Now: boolean;
    notice?: string;
  },
): Promise<{ requestId: string; testId: string; message: string }> {
  const existing = await fetchElevateXAdminState(admin);
  if (existing.published && existing.requestId) {
    throw new Error(
      'ElevateX is already published. Add or update slots below, or open slots from Exam schedules.',
    );
  }

  const enrichedSlots = enrichSlotsWithPasswords(input.scheduleSlots);

  const slotErr =
    validateElevateXPublishSlots(enrichedSlots) ??
    validateOptionalConfiguredSlots(enrichedSlots);
  if (slotErr) throw new Error(slotErr);

  const result = await createFacultyExamRequestRecord(admin, {
    creatorUserId: input.creatorUserId,
    primaryDepartment: 'All departments',
    title: input.title.trim() || ELEVATEX_EXAM_NAME,
    topic: serializeElevateXTechnicalConfig(defaultElevateXTechnicalFormats()),
    description: input.description ?? null,
    targetYears: input.targetYears,
    durationMinutes: 60,
    questions: [],
    testType: ELEVATEX_BUILDER_TEST_TYPE_ID,
    status: 'approved',
    autoPublish: true,
    usesSlotScheduling: true,
    scheduleSlots: enrichedSlots,
    goLiveNotice: input.notice ?? `${ELEVATEX_EXAM_NAME} is now live for your slot.`,
  });

  const configured = filterConfiguredScheduleSlots(enrichedSlots);
  if (result.testId && configured.length > 0) {
    await syncElevateXEvaloraModuleFromConfiguredSlots(
      admin,
      configured,
      input.creatorUserId,
      input.notice ?? null,
    );
  }

  return {
    requestId: result.requestId,
    testId: result.testId ?? ELEVATEX_TEST_ID,
    message:
      configured.length > 0
        ? `ElevateX published. ${configured.length} slot(s) are live — students can start only during their assigned slot window.`
        : 'ElevateX published. Configure Slot 1 with date, time, and roster.',
  };
}

export async function saveElevateXSlot(
  admin: DbServiceClient,
  input: {
    requestId: string;
    slot: ExamScheduleSlotInput;
    adminUserId: string;
    goLiveNow?: boolean;
  },
): Promise<{ scheduleId: string | null; message: string }> {
  const err = validateSingleScheduleSlot(input.slot);
  if (err) throw new Error(err);

  const { data: request, error: reqErr } = await admin
    .from('faculty_exam_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle();

  if (reqErr || !request) throw new Error('ElevateX exam request not found');

  const slots = parseScheduleSlotsJson(request.schedule_slots_json);
  const merged = slots.filter((s) => s.slot_number !== input.slot.slot_number);
  merged.push(input.slot);
  merged.sort((a, b) => a.slot_number - b.slot_number);

  const optionalErr = validateOptionalConfiguredSlots(merged);
  if (optionalErr) throw new Error(optionalErr);

  await admin
    .from('faculty_exam_requests')
    .update({
      schedule_slots_json: merged,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.requestId);

  const enrichedSlot = enrichSlotsWithPasswords([input.slot])[0]!;
  await persistSlotRosterForSlot(admin, input.requestId, enrichedSlot);

  const provision = await provisionStudentsFromSlotRoster(admin, {
    slots: [enrichedSlot],
    defaultDepartment: String(request.department ?? 'All departments'),
    defaultYears: (request.target_years as string[]) ?? [],
  });
  assertRosterProvisionSucceeded(provision, enrichedSlot.roster.length);

  const testId = String(request.published_test_id ?? ELEVATEX_TEST_ID);
  if (!request.published_test_id) {
    await publishFacultyExamRequest(admin, input.requestId, input.adminUserId);
  }

  const targetDepartments = Array.from(
    new Set([String(request.department), ...((request.target_branches as string[]) ?? [])]),
  );

  const { data: existingSchedule } = await admin
    .from('exam_schedules')
    .select('id')
    .eq('faculty_exam_request_id', input.requestId)
    .eq('slot_number', input.slot.slot_number)
    .maybeSingle();

  let scheduleId = existingSchedule?.id ? String(existingSchedule.id) : null;

  if (!scheduleId) {
    const created = await createScheduleForSlot(admin, {
      requestId: input.requestId,
      testId,
      title: String(request.title),
      description: (request.description as string | null) ?? null,
      targetDepartments,
      targetYears: (request.target_years as string[]) ?? [],
      createdBy: input.adminUserId,
      slot: input.slot,
    });
    scheduleId = created?.scheduleId ?? null;
  } else {
    const starts_at = combineDateAndTime(input.slot.exam_date, input.slot.start_time);
    const ends_at = combineDateAndTime(input.slot.exam_date, input.slot.end_time);
    await admin
      .from('exam_schedules')
      .update({
        starts_at,
        ends_at,
        notice: `${input.slot.roster.length} students · Slot ${input.slot.slot_number}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);
  }

  if (scheduleId) {
    await syncExamStudentRosters(
      admin,
      [{ scheduleId, slot_number: input.slot.slot_number }],
      [input.slot],
    );
  }

  if (input.goLiveNow && scheduleId) {
    await goLiveExamScheduleNow(admin, scheduleId, { openWindowNow: true });
    const allSlots = filterConfiguredScheduleSlots(merged);
    if (allSlots.length > 0) {
      await syncElevateXEvaloraModuleFromConfiguredSlots(
        admin,
        allSlots,
        input.adminUserId,
      );
    }
    return {
      scheduleId,
      message: `Slot ${input.slot.slot_number} saved and is now live.`,
    };
  }

  return {
    scheduleId,
    message: `Slot ${input.slot.slot_number} saved. Open it from Exam schedules when ready.`,
  };
}

export async function goLiveElevateXSlot(
  admin: DbServiceClient,
  scheduleId: string,
  adminUserId: string,
): Promise<ExamScheduleRow> {
  const liveRow = await goLiveExamScheduleNow(admin, scheduleId, { openWindowNow: true });
  const requestId = liveRow.faculty_exam_request_id;
  if (!requestId) return liveRow;

  try {
    const { data: request } = await admin
      .from('faculty_exam_requests')
      .select('schedule_slots_json')
      .eq('id', requestId)
      .maybeSingle();

    const configured = filterConfiguredScheduleSlots(
      parseScheduleSlotsJson(request?.schedule_slots_json),
    );
    if (configured.length > 0) {
      await syncElevateXEvaloraModuleFromConfiguredSlots(admin, configured, adminUserId);
    } else {
      await syncElevateXEvaloraModuleFromSchedule(admin, liveRow, adminUserId);
    }
  } catch (syncErr) {
    console.warn('[goLiveElevateXSlot] evalora module sync:', syncErr);
  }

  return liveRow;
}

/** Re-create / reset AWS RDS logins from the published ElevateX roster (fixes CSV login issues). */
export async function saveElevateXTechnicalFormats(
  admin: DbServiceClient,
  requestId: string,
  formats: ElevateXTechnicalFormatsMap,
): Promise<{ message: string }> {
  const merged = mergeElevateXTechnicalFormats(formats);
  for (const value of Object.values(merged)) {
    if (value !== 'mcq' && value !== 'coding' && value !== 'both') {
      throw new Error('Invalid technical format in configuration.');
    }
  }

  const { error } = await admin
    .from('faculty_exam_requests')
    .update({
      topic: serializeElevateXTechnicalConfig(merged),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw new Error(error.message);

  return {
    message: 'Technical section formats saved. Students will use these settings for their branch.',
  };
}

/** Resolve format for a student branch from the published ElevateX request (server-authoritative). */
export async function fetchElevateXTechnicalFormatForDepartment(
  admin: DbServiceClient,
  departmentId: string,
): Promise<PlacementTechnicalFormat> {
  const { data: request } = await admin
    .from('faculty_exam_requests')
    .select('topic')
    .eq('test_type', ELEVATEX_BUILDER_TEST_TYPE_ID)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return resolveTechnicalFormatForDepartment(
    departmentId,
    parseElevateXTechnicalConfig(request?.topic as string | null | undefined),
  );
}

export async function reprovisionElevateXRoster(
  admin: DbServiceClient,
  requestId: string,
): Promise<RosterProvisionResult & { message: string }> {
  const { data: request, error } = await admin
    .from('faculty_exam_requests')
    .select('department, target_years, target_branches, schedule_slots_json')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !request) throw new Error('ElevateX exam request not found');

  let slots = enrichSlotsWithPasswords(
    filterConfiguredScheduleSlots(parseScheduleSlotsJson(request.schedule_slots_json)),
  );
  if (slots.length === 0) {
    throw new Error('No configured slots with rosters to provision.');
  }

  const rosterStudents = slots.reduce((n, slot) => n + slot.roster.length, 0);
  const provision = await provisionStudentsFromSlotRoster(admin, {
    slots,
    defaultDepartment: String(request.department ?? 'All departments'),
    defaultYears: (request.target_years as string[]) ?? [],
  });
  assertRosterProvisionSucceeded(provision, rosterStudents);

  return {
    ...provision,
    message: `Student logins updated: ${provision.created} created, ${provision.updated} passwords reset.`,
  };
}
