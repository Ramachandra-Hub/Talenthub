import type { DbServiceClient } from '@/lib/db/get-db-service';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import {
  isScheduleWindowOpen,
  normalizeEndsAtForGoLive,
  resolveExamScheduleStatus,
  scheduleMatchesStudent,
  scheduleStartMs,
  type ExamScheduleRow,
} from '@/lib/exam-schedule';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { combineDateAndTimeIst, formatCollegeDateTime } from '@/lib/college-timezone';

export const EXAM_SLOT_COUNT = 8;
export const EXAM_SLOT_CAPACITY_DEFAULT = 130;

export type ExamSlotRosterEntry = {
  roll_number: string;
  student_name?: string;
  email?: string;
  branch?: string;
  academic_year?: string;
  password?: string;
};

export type ExamScheduleSlotInput = {
  slot_number: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  capacity?: number;
  roster: ExamSlotRosterEntry[];
  approval_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  submitted_at?: string | null;
  approved_at?: string | null;
};

export type ParsedExamScheduleSlot = ExamScheduleSlotInput & {
  starts_at: string;
  ends_at: string;
  capacity: number;
};

export function normalizeRoll(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function combineDateAndTime(dateStr: string, timeStr: string): string {
  return combineDateAndTimeIst(dateStr, timeStr);
}

export function parseScheduleSlotsJson(raw: unknown): ExamScheduleSlotInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamScheduleSlotInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const slot_number = Number(row.slot_number);
    if (!Number.isFinite(slot_number) || slot_number < 1 || slot_number > EXAM_SLOT_COUNT) {
      continue;
    }
    const rosterRaw = Array.isArray(row.roster) ? row.roster : [];
    const roster: ExamSlotRosterEntry[] = [];
    const seen = new Set<string>();
    for (const r of rosterRaw) {
      if (!r || typeof r !== 'object') continue;
      const entry = r as Record<string, unknown>;
      const roll = normalizeRoll(String(entry.roll_number ?? ''));
      if (!roll || seen.has(roll)) continue;
      seen.add(roll);
      roster.push({
        roll_number: roll,
        student_name: entry.student_name ? String(entry.student_name).trim() : undefined,
        email: entry.email ? String(entry.email).trim() : undefined,
        branch: entry.branch ? String(entry.branch).trim() : undefined,
        academic_year: entry.academic_year ? String(entry.academic_year).trim() : undefined,
        password: entry.password ? String(entry.password).trim() : undefined,
      });
    }
    out.push({
      slot_number: Math.floor(slot_number),
      exam_date: String(row.exam_date ?? '').trim(),
      start_time: String(row.start_time ?? '').trim(),
      end_time: String(row.end_time ?? '').trim(),
      capacity: Number(row.capacity) || EXAM_SLOT_CAPACITY_DEFAULT,
      roster,
      approval_status: ['draft', 'pending', 'approved', 'rejected'].includes(
        String(row.approval_status ?? 'draft'),
      )
        ? (String(row.approval_status) as ExamScheduleSlotInput['approval_status'])
        : 'draft',
      submitted_at: row.submitted_at ? String(row.submitted_at) : null,
      approved_at: row.approved_at ? String(row.approved_at) : null,
    });
  }
  return out.sort((a, b) => a.slot_number - b.slot_number);
}

/** Slot has date, time, and at least one student — ready for schedule creation. */
export function isScheduleSlotConfigured(slot: ExamScheduleSlotInput): boolean {
  return Boolean(
    slot.exam_date?.trim() &&
      slot.start_time?.trim() &&
      slot.end_time?.trim() &&
      slot.roster.length > 0,
  );
}

/** Any meaningful progress on a slot (ignores default empty times without a date). */
export function isScheduleSlotPartiallyFilled(slot: ExamScheduleSlotInput): boolean {
  if (slot.roster.length > 0) return true;
  return Boolean(slot.exam_date?.trim());
}

export function filterConfiguredScheduleSlots(
  slots: ExamScheduleSlotInput[],
): ExamScheduleSlotInput[] {
  return slots.filter(isScheduleSlotConfigured);
}

/** ElevateX: only Slot 1 is required to publish; Slots 2–8 can be added later. */
export function validateElevateXPublishSlots(slots: ExamScheduleSlotInput[]): string | null {
  const slot1 = slots.find((s) => s.slot_number === 1);
  if (!slot1) {
    return 'Configure Slot 1 with exam date, start/end time, and student roster.';
  }
  return validateSingleScheduleSlot(slot1);
}

/** If slots 2–8 are partially filled, they must be complete. */
export function validateOptionalConfiguredSlots(slots: ExamScheduleSlotInput[]): string | null {
  for (const slot of slots) {
    if (slot.slot_number === 1) continue;
    if (!isScheduleSlotPartiallyFilled(slot)) continue;
    if (!isScheduleSlotConfigured(slot)) {
      return `Slot ${slot.slot_number}: complete date, time, and roster, or clear the slot.`;
    }
    const err = validateSingleScheduleSlot(slot);
    if (err) return err;
  }
  return null;
}

/** Validate a single slot (date, time, roster) for incremental faculty submit. */
export function validateSingleScheduleSlot(slot: ExamScheduleSlotInput): string | null {
  if (!slot.exam_date) return `Slot ${slot.slot_number}: exam date is required.`;
  if (!slot.start_time || !slot.end_time) {
    return `Slot ${slot.slot_number}: start and end times are required.`;
  }
  const starts_at = combineDateAndTime(slot.exam_date, slot.start_time);
  const ends_at = combineDateAndTime(slot.exam_date, slot.end_time);
  if (!starts_at || !ends_at) {
    return `Slot ${slot.slot_number}: invalid date or time.`;
  }
  if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
    return `Slot ${slot.slot_number}: end time must be after start time.`;
  }
  const cap = Math.min(
    EXAM_SLOT_CAPACITY_DEFAULT,
    Math.max(1, Number(slot.capacity) || EXAM_SLOT_CAPACITY_DEFAULT),
  );
  if (slot.roster.length === 0) {
    return `Slot ${slot.slot_number}: upload at least one student (roll number).`;
  }
  if (slot.roster.length > cap) {
    return `Slot ${slot.slot_number}: maximum ${cap} students allowed (you uploaded ${slot.roster.length}).`;
  }
  return null;
}

export function validateScheduleSlots(slots: ExamScheduleSlotInput[]): string | null {
  if (slots.length !== EXAM_SLOT_COUNT) {
    return `Configure all ${EXAM_SLOT_COUNT} slots (date, start time, end time, and student list).`;
  }
  const numbers = new Set<number>();
  for (const slot of slots) {
    if (numbers.has(slot.slot_number)) {
      return `Duplicate slot number ${slot.slot_number}.`;
    }
    numbers.add(slot.slot_number);
    if (!slot.exam_date) return `Slot ${slot.slot_number}: exam date is required.`;
    if (!slot.start_time || !slot.end_time) {
      return `Slot ${slot.slot_number}: start and end times are required.`;
    }
    const starts_at = combineDateAndTime(slot.exam_date, slot.start_time);
    const ends_at = combineDateAndTime(slot.exam_date, slot.end_time);
    if (!starts_at || !ends_at) {
      return `Slot ${slot.slot_number}: invalid date or time.`;
    }
    if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
      return `Slot ${slot.slot_number}: end time must be after start time.`;
    }
    const cap = Math.min(EXAM_SLOT_CAPACITY_DEFAULT, Math.max(1, Number(slot.capacity) || EXAM_SLOT_CAPACITY_DEFAULT));
    if (slot.roster.length === 0) {
      return `Slot ${slot.slot_number}: upload at least one student (roll number).`;
    }
    if (slot.roster.length > cap) {
      return `Slot ${slot.slot_number}: maximum ${cap} students allowed (you uploaded ${slot.roster.length}).`;
    }
  }
  for (let n = 1; n <= EXAM_SLOT_COUNT; n++) {
    if (!numbers.has(n)) return `Slot ${n} is missing.`;
  }
  return null;
}

/** Earliest start and latest end across configured slots (ElevateX portal window). */
export function scheduleWindowFromConfiguredSlots(slots: ExamScheduleSlotInput[]): {
  starts_at: string;
  ends_at: string | null;
} {
  const configured = filterConfiguredScheduleSlots(slots);
  const parsed = enrichScheduleSlots(configured);
  if (!parsed.length) {
    const now = new Date().toISOString();
    return { starts_at: now, ends_at: null };
  }
  const starts = parsed
    .map((s) => new Date(s.starts_at).getTime())
    .filter((t) => !Number.isNaN(t));
  const ends = parsed
    .map((s) => new Date(s.ends_at).getTime())
    .filter((t) => !Number.isNaN(t));
  return {
    starts_at: new Date(Math.min(...starts)).toISOString(),
    ends_at: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
  };
}

export function enrichScheduleSlots(slots: ExamScheduleSlotInput[]): ParsedExamScheduleSlot[] {
  return slots.map((slot) => ({
    ...slot,
    starts_at: combineDateAndTime(slot.exam_date, slot.start_time),
    ends_at: combineDateAndTime(slot.exam_date, slot.end_time),
    capacity: Math.min(
      EXAM_SLOT_CAPACITY_DEFAULT,
      Math.max(1, Number(slot.capacity) || EXAM_SLOT_CAPACITY_DEFAULT),
    ),
  }));
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function headerIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i]!.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aliases.some((alias) => normalized.includes(alias))) return i;
  }
  return -1;
}

function readCell(parts: string[], index: number): string | undefined {
  if (index < 0 || index >= parts.length) return undefined;
  const value = parts[index]?.trim();
  return value || undefined;
}

export function parseRosterCsv(text: string): ExamSlotRosterEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstParts = splitCsvLine(lines[0]!);
  const headerCells = firstParts.map((p) => p.toLowerCase());
  const hasHeader =
    headerIndex(headerCells, ['roll', 'rollnumber', 'rollno', 'registration']) >= 0 ||
    headerIndex(headerCells, ['name', 'fullname', 'studentname']) >= 0 ||
    headerIndex(headerCells, ['email']) >= 0 ||
    headerIndex(headerCells, ['department', 'dept', 'branch']) >= 0;

  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rollIdx = hasHeader
    ? headerIndex(headerCells, ['roll', 'rollnumber', 'rollno', 'registration'])
    : 0;
  const nameIdx = hasHeader ? headerIndex(headerCells, ['name', 'fullname', 'studentname']) : 1;
  const emailIdx = hasHeader ? headerIndex(headerCells, ['email', 'mail']) : -1;
  const passwordIdx = hasHeader ? headerIndex(headerCells, ['password', 'pass', 'pwd']) : -1;
  const branchIdx = hasHeader
    ? headerIndex(headerCells, ['department', 'dept', 'branch'])
    : -1;
  const yearIdx = hasHeader
    ? headerIndex(headerCells, ['year', 'academicyear', 'batch'])
    : -1;

  const out: ExamSlotRosterEntry[] = [];
  const seen = new Set<string>();
  for (const line of dataLines) {
    const parts = splitCsvLine(line);
    const roll = normalizeRoll(readCell(parts, rollIdx >= 0 ? rollIdx : 0) ?? '');
    if (!roll || seen.has(roll)) continue;
    seen.add(roll);

    let email = emailIdx >= 0 ? readCell(parts, emailIdx) : undefined;
    let password = passwordIdx >= 0 ? readCell(parts, passwordIdx) : undefined;
    let branch = branchIdx >= 0 ? readCell(parts, branchIdx) : undefined;
    let academicYear = yearIdx >= 0 ? readCell(parts, yearIdx) : undefined;
    let studentName = nameIdx >= 0 ? readCell(parts, nameIdx) : undefined;

    if (!hasHeader && parts.length >= 2 && parts[1]?.includes('@')) {
      email = readCell(parts, 1);
      password = readCell(parts, 2);
      branch = readCell(parts, 3);
      academicYear = readCell(parts, 4);
      studentName = undefined;
    }

    out.push({
      roll_number: roll,
      student_name: studentName,
      email,
      branch,
      academic_year: academicYear,
      password,
    });
  }
  return out;
}

export async function persistSlotRoster(
  admin: DbServiceClient,
  requestId: string,
  slots: ExamScheduleSlotInput[],
): Promise<void> {
  await admin.from('exam_slot_roster_entries').delete().eq('faculty_exam_request_id', requestId);
  await insertSlotRosterRows(admin, requestId, slots);
}

export async function persistSlotRosterForSlot(
  admin: DbServiceClient,
  requestId: string,
  slot: ExamScheduleSlotInput,
): Promise<void> {
  await admin
    .from('exam_slot_roster_entries')
    .delete()
    .eq('faculty_exam_request_id', requestId)
    .eq('slot_number', slot.slot_number);
  await insertSlotRosterRows(admin, requestId, [slot]);
}

async function insertSlotRosterRows(
  admin: DbServiceClient,
  requestId: string,
  slots: ExamScheduleSlotInput[],
): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];
  for (const slot of slots) {
    for (const student of slot.roster) {
      rows.push({
        faculty_exam_request_id: requestId,
        slot_number: slot.slot_number,
        roll_number: student.roll_number,
        student_name: student.student_name ?? null,
        email: student.email ?? null,
        branch: student.branch ?? null,
        academic_year: student.academic_year ?? null,
        password: student.password ?? null,
      });
    }
  }
  if (rows.length === 0) return;

  let { error } = await admin.from('exam_slot_roster_entries').insert(rows);
  if (error?.message?.includes('branch') || error?.message?.includes('academic_year')) {
    const fallbackRows = rows.map((row) => {
      const { branch: _b, academic_year: _y, login_password: _p, ...rest } = row;
      return rest;
    });
    const retry = await admin.from('exam_slot_roster_entries').insert(fallbackRows);
    error = retry.error;
  }
  if (error?.message?.includes('login_password')) {
    const fallbackRows = rows.map((row) => {
      const { login_password: _p, ...rest } = row;
      return rest;
    });
    const retry = await admin.from('exam_slot_roster_entries').insert(fallbackRows);
    error = retry.error;
  }
  if (error) throw new Error(error.message);
}

export async function createScheduleForSlot(
  admin: DbServiceClient,
  input: {
    requestId: string;
    testId: string;
    title: string;
    description: string | null;
    targetDepartments: string[];
    targetYears: string[];
    createdBy: string;
    slot: ExamScheduleSlotInput;
  },
): Promise<{ scheduleId: string; slot_number: number } | null> {
  const created = await createSchedulesFromSlots(admin, {
    requestId: input.requestId,
    testId: input.testId,
    title: input.title,
    description: input.description,
    targetDepartments: input.targetDepartments,
    targetYears: input.targetYears,
    createdBy: input.createdBy,
    slots: [input.slot],
  });
  return created[0] ?? null;
}

export async function rebuildSlotsFromRosterEntries(
  admin: DbServiceClient,
  requestId: string,
  scheduleMeta?: ExamScheduleSlotInput[],
): Promise<ExamScheduleSlotInput[]> {
  const { data: entries, error } = await admin
    .from('exam_slot_roster_entries')
    .select('slot_number, roll_number, student_name, email, branch, academic_year, login_password')
    .eq('faculty_exam_request_id', requestId)
    .order('slot_number');

  if (error || !entries?.length) return [];

  const metaBySlot = new Map((scheduleMeta ?? []).map((slot) => [slot.slot_number, slot]));
  const bySlot = new Map<number, ExamSlotRosterEntry[]>();

  for (const row of entries) {
    const slotNum = Number(row.slot_number);
    if (!Number.isFinite(slotNum)) continue;
    const list = bySlot.get(slotNum) ?? [];
    list.push({
      roll_number: normalizeRoll(String(row.roll_number)),
      student_name: (row.student_name as string | null) ?? undefined,
      email: (row.email as string | null) ?? undefined,
      branch: (row.branch as string | null) ?? undefined,
      academic_year: (row.academic_year as string | null) ?? undefined,
      password: (row.login_password as string | null) ?? undefined,
    });
    bySlot.set(slotNum, list);
  }

  return Array.from(bySlot.keys())
    .sort((a, b) => a - b)
    .map((slotNum) => {
      const meta = metaBySlot.get(slotNum);
      return {
        slot_number: slotNum,
        exam_date: meta?.exam_date ?? '',
        start_time: meta?.start_time ?? '09:00',
        end_time: meta?.end_time ?? '11:00',
        capacity: meta?.capacity ?? EXAM_SLOT_CAPACITY_DEFAULT,
        roster: bySlot.get(slotNum) ?? [],
      };
    });
}

export type CreatedSlotSchedule = {
  scheduleId: string;
  slot_number: number;
};

export async function syncExamStudentRosters(
  admin: DbServiceClient,
  schedules: CreatedSlotSchedule[],
  slots: ExamScheduleSlotInput[],
): Promise<void> {
  if (schedules.length === 0) return;

  const scheduleBySlot = new Map(schedules.map((row) => [row.slot_number, row.scheduleId]));
  const scheduleIds = schedules.map((row) => row.scheduleId);

  await admin.from('exam_student_roster').delete().in('exam_schedule_id', scheduleIds);

  const rows: Array<Record<string, unknown>> = [];
  for (const slot of slots) {
    const scheduleId = scheduleBySlot.get(slot.slot_number);
    if (!scheduleId) continue;
    for (const student of slot.roster) {
      rows.push({
        exam_schedule_id: scheduleId,
        roll_number: student.roll_number,
        email: student.email ?? null,
        full_name: student.student_name ?? null,
        branch: student.branch ?? null,
        academic_year: student.academic_year ?? null,
      });
    }
  }

  if (rows.length === 0) return;

  const { error } = await admin.from('exam_student_roster').insert(rows);
  if (error && !error.message.includes('exam_student_roster')) {
    throw new Error(error.message);
  }
}

export async function loadSlotsForRequest(
  admin: DbServiceClient,
  requestId: string,
): Promise<{ uses_slot_scheduling: boolean; slots: ExamScheduleSlotInput[] }> {
  const { data, error } = await admin
    .from('faculty_exam_requests')
    .select('uses_slot_scheduling, schedule_slots_json')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !data) {
    return { uses_slot_scheduling: false, slots: [] };
  }

  const uses = Boolean(data.uses_slot_scheduling);
  const slots = parseScheduleSlotsJson(data.schedule_slots_json);
  return { uses_slot_scheduling: uses, slots };
}

export async function findStudentSlotAssignment(
  admin: DbServiceClient,
  requestId: string,
  rollNumber: string,
): Promise<{ slot_number: number; student_name: string | null } | null> {
  const roll = normalizeRoll(rollNumber);
  if (!roll) return null;

  const { data, error } = await admin
    .from('exam_slot_roster_entries')
    .select('slot_number, student_name')
    .eq('faculty_exam_request_id', requestId)
    .eq('roll_number', roll)
    .maybeSingle();

  if (!error && data?.slot_number) {
    return {
      slot_number: Number(data.slot_number),
      student_name: (data.student_name as string | null) ?? null,
    };
  }

  const { uses_slot_scheduling, slots } = await loadSlotsForRequest(admin, requestId);
  if (!uses_slot_scheduling) return null;

  for (const slot of slots) {
    const hit = slot.roster.find((r) => normalizeRoll(r.roll_number) === roll);
    if (hit) {
      return { slot_number: slot.slot_number, student_name: hit.student_name ?? null };
    }
  }
  return null;
}

export type SlotAccessDetail = {
  assigned_slot: number | null;
  slot_label: string;
  window_label: string;
};

export async function checkStudentSlotExamAccess(
  admin: DbServiceClient,
  input: {
    schedules: ExamScheduleRow[];
    facultyExamRequestId: string;
    rollNumber: string;
    email?: string | null;
    metadata?: Record<string, unknown> | null;
    department: string;
    year: string;
    now?: number;
  },
): Promise<
  | { allowed: true; schedule: ExamScheduleRow; detail?: SlotAccessDetail }
  | {
      allowed: false;
      code: 'SLOT_NOT_ASSIGNED' | 'SLOT_WRONG_WINDOW' | 'NOT_LIVE';
      message: string;
      schedule: ExamScheduleRow | null;
      detail?: SlotAccessDetail;
    }
> {
  const { uses_slot_scheduling, slots } = await loadSlotsForRequest(
    admin,
    input.facultyExamRequestId,
  );
  if (!uses_slot_scheduling || slots.length === 0) {
    return { allowed: false, code: 'NOT_LIVE', message: 'Slot schedule not configured.', schedule: null };
  }

  const roll =
    normalizeRoll(input.rollNumber) ||
    normalizeRoll(rollNumberFromUser(input.email ?? '', input.metadata ?? null));

  const assignment = await findStudentSlotAssignment(
    admin,
    input.facultyExamRequestId,
    roll,
  );

  if (!assignment) {
    return {
      allowed: false,
      code: 'SLOT_NOT_ASSIGNED',
      message:
        'This examination is locked. Your roll number is not assigned to any slot. Contact your faculty or the examination cell.',
      schedule: input.schedules[0] ?? null,
    };
  }

  const parsed = enrichScheduleSlots(slots);
  const mySlot = parsed.find((s) => s.slot_number === assignment.slot_number);
  const mySchedule =
    input.schedules.find((s) => (s as ExamScheduleRow & { slot_number?: number }).slot_number === assignment.slot_number) ??
    input.schedules.find((s) => s.title.includes(`Slot ${assignment.slot_number}`)) ??
    null;

  const detail: SlotAccessDetail = {
    assigned_slot: assignment.slot_number,
    slot_label: `Slot ${assignment.slot_number}`,
    window_label: mySlot
      ? `${mySlot.exam_date} · ${mySlot.start_time} – ${mySlot.end_time}`
      : 'See examination schedule',
  };

  if (!mySchedule) {
    return {
      allowed: false,
      code: 'NOT_LIVE',
      message: `Your slot is ${detail.slot_label} (${detail.window_label}). The schedule is not published yet — wait for the examination cell to go live.`,
      schedule: null,
      detail,
    };
  }

  const now = input.now ?? Date.now();

  if (
    !scheduleMatchesStudent(mySchedule, input.department, input.year)
  ) {
    return {
      allowed: false,
      code: 'SLOT_NOT_ASSIGNED',
      message: 'This examination is not scheduled for your department or academic year.',
      schedule: mySchedule,
      detail,
    };
  }

  if (isScheduleWindowOpen(mySchedule, now)) {
    return { allowed: true, schedule: mySchedule, detail };
  }

  const anyLive = input.schedules.filter((s) => isScheduleWindowOpen(s, now));
  if (anyLive.length > 0) {
    return {
      allowed: false,
      code: 'SLOT_WRONG_WINDOW',
      message: `This examination is locked for your account. You are assigned to ${detail.slot_label} (${detail.window_label}). Another slot is live now — open the test only during your slot time.`,
      schedule: mySchedule,
      detail,
    };
  }

  const start = mySlot ? formatCollegeDateTime(mySlot.starts_at) : '';
  const end = mySlot ? formatCollegeDateTime(mySlot.ends_at) : '';

  return {
    allowed: false,
    code: 'NOT_LIVE',
    message: `Your examination window (${detail.slot_label}) is ${detail.window_label}. ${start && end ? `Opens ${start} and closes ${end}.` : 'It is not live yet.'}`,
    schedule: mySchedule,
    detail,
  };
}

export async function createSchedulesFromSlots(
  admin: DbServiceClient,
  input: {
    requestId: string;
    testId: string;
    title: string;
    description: string | null;
    targetDepartments: string[];
    targetYears: string[];
    createdBy: string;
    slots: ExamScheduleSlotInput[];
  },
): Promise<CreatedSlotSchedule[]> {
  const parsed = enrichScheduleSlots(input.slots);
  const created: CreatedSlotSchedule[] = [];

  for (const slot of parsed) {
    const payload: Record<string, unknown> = {
      title: `${input.title} · Slot ${slot.slot_number}`,
      description: input.description,
      notice: `${slot.roster.length} students · max ${slot.capacity}`,
      faculty_exam_request_id: input.requestId,
      test_id: input.testId,
      status: 'scheduled',
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      target_departments: input.targetDepartments,
      target_years: input.targetYears,
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
      slot_number: slot.slot_number,
      slot_capacity: slot.capacity,
    };

    const { data, error } = await admin
      .from('exam_schedules')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      const withoutSlotCols = { ...payload };
      delete withoutSlotCols.slot_number;
      delete withoutSlotCols.slot_capacity;
      const retry = await admin
        .from('exam_schedules')
        .insert(withoutSlotCols)
        .select('id')
        .single();
      if (retry.error) throw new Error(retry.error.message);
      if (retry.data?.id) {
        created.push({ scheduleId: String(retry.data.id), slot_number: slot.slot_number });
      }
    } else if (data?.id) {
      created.push({ scheduleId: String(data.id), slot_number: slot.slot_number });
    }
  }

  return created;
}

export function scheduleSlotNumber(schedule: ExamScheduleRow): number | null {
  const direct = Number((schedule as ExamScheduleRow & { slot_number?: number }).slot_number);
  if (Number.isFinite(direct) && direct >= 1) return Math.floor(direct);
  const match = schedule.title.match(/Slot\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

export function schedulesForExamRequest(
  schedules: ExamScheduleRow[],
  requestId: string,
): ExamScheduleRow[] {
  return schedules.filter((s) => s.faculty_exam_request_id === requestId);
}

/** Only one slot live at a time; slot N after slots 1…N−1 have ended. */
export function validateSequentialSlotGoLive(
  related: ExamScheduleRow[],
  targetSlotNumber: number,
): string | null {
  if (targetSlotNumber < 1 || targetSlotNumber > EXAM_SLOT_COUNT) {
    return 'Invalid slot number.';
  }

  for (let n = 1; n < targetSlotNumber; n++) {
    const prev = related.find((s) => scheduleSlotNumber(s) === n);
    if (!prev) return `Slot ${n} schedule is missing.`;
    if (prev.status === 'live') {
      return `End Slot ${n} before opening Slot ${targetSlotNumber}.`;
    }
    const prevResolved = resolveExamScheduleStatus(prev);
    if (prev.status !== 'ended' && prevResolved.display !== 'window_ended') {
      return `Open slots in order: end Slot ${n} before Slot ${targetSlotNumber} can go live.`;
    }
  }

  const otherLive = related.find(
    (s) => s.status === 'live' && scheduleSlotNumber(s) !== targetSlotNumber,
  );
  if (otherLive) {
    const other = scheduleSlotNumber(otherLive) ?? '?';
    return `End Slot ${other} first. Only one slot can be live at a time.`;
  }

  return null;
}

/** Lowest slot number that may go live next for this exam request. */
export function nextSequentialSlotToGoLive(related: ExamScheduleRow[]): number | null {
  const anyLive = related.find((s) => s.status === 'live');
  if (anyLive) return null;

  for (let n = 1; n <= EXAM_SLOT_COUNT; n++) {
    const row = related.find((s) => scheduleSlotNumber(s) === n);
    if (!row) continue;
    if (row.status === 'live') return null;
    const resolved = resolveExamScheduleStatus(row);
    const reopenable =
      row.status === 'scheduled' ||
      row.status === 'ended' ||
      resolved.display === 'window_ended';
    if (!reopenable) continue;
    if (!validateSequentialSlotGoLive(related, n)) return n;
  }
  return null;
}

/** Go live one slot; ends any other live slot on the same exam first. */
export async function goLiveExamScheduleSlotSequential(
  admin: DbServiceClient,
  scheduleId: string,
): Promise<ExamScheduleRow> {
  const { data: existing, error: fetchErr } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new Error('Schedule not found');
  }

  const row = existing as ExamScheduleRow;
  const requestId = row.faculty_exam_request_id;
  const slotNum = scheduleSlotNumber(row);

  if (!requestId || slotNum == null) {
    throw new Error('This schedule is not part of a slot-based exam.');
  }

  const { data: relatedRows, error: relatedErr } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('faculty_exam_request_id', requestId);

  if (relatedErr) throw new Error(relatedErr.message);

  const related = (relatedRows ?? []) as ExamScheduleRow[];
  const seqErr = validateSequentialSlotGoLive(related, slotNum);
  if (seqErr) throw new Error(seqErr);

  const now = new Date().toISOString();
  for (const other of related) {
    if (other.id === scheduleId || other.status !== 'live') continue;
    await admin
      .from('exam_schedules')
      .update({
        status: 'ended',
        ends_at: other.ends_at ?? now,
        updated_at: now,
      })
      .eq('id', other.id);
  }

  const startsAtIso = String(row.starts_at ?? '');
  const normalizedEnd = normalizeEndsAtForGoLive(startsAtIso, row.ends_at ?? null);

  const patch: Record<string, unknown> = {
    status: 'live',
    updated_at: now,
  };
  if (normalizedEnd !== row.ends_at) {
    patch.ends_at = normalizedEnd;
  }

  const { data: updated, error: updateErr } = await admin
    .from('exam_schedules')
    .update(patch)
    .eq('id', scheduleId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message ?? 'Could not go live');
  }

  return updated as ExamScheduleRow;
}

/**
 * ElevateX publish: mark every configured slot schedule as live.
 * Students still only access during their roster slot's time window.
 */
export async function goLiveAllConfiguredSlotSchedules(
  admin: DbServiceClient,
  requestId: string,
): Promise<{ updated: number; slotNumbers: number[] }> {
  const { data: rows, error } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('faculty_exam_request_id', requestId);

  if (error) throw new Error(error.message);

  const related = (rows ?? []) as ExamScheduleRow[];
  const now = new Date().toISOString();
  let updated = 0;
  const slotNumbers: number[] = [];

  for (const row of related) {
    const slotNum = scheduleSlotNumber(row);
    if (slotNum == null) continue;

    const startsAtIso = String(row.starts_at ?? now);
    const normalizedEnd = normalizeEndsAtForGoLive(startsAtIso, row.ends_at ?? null);
    const patch: Record<string, unknown> = {
      status: 'live',
      updated_at: now,
    };
    if (normalizedEnd !== row.ends_at) {
      patch.ends_at = normalizedEnd;
    }

    const { error: upErr } = await admin.from('exam_schedules').update(patch).eq('id', row.id);
    if (!upErr) {
      updated += 1;
      slotNumbers.push(slotNum);
    }
  }

  slotNumbers.sort((a, b) => a - b);
  return { updated, slotNumbers };
}

function mapPrismaExamScheduleRow(row: {
  id: string;
  testId: string | null;
  title: string | null;
  description: string | null;
  notice: string | null;
  facultyExamRequestId: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetDepartments: unknown;
  targetYears: unknown;
  slotNumber: number | null;
  slotCapacity: number | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExamScheduleRow {
  return {
    id: row.id,
    title: row.title ?? 'Exam',
    description: row.description,
    notice: row.notice,
    faculty_exam_request_id: row.facultyExamRequestId,
    test_id: row.testId ?? '',
    status: row.status as ExamScheduleRow['status'],
    starts_at: row.startsAt?.toISOString() ?? new Date().toISOString(),
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: Array.isArray(row.targetDepartments)
      ? (row.targetDepartments as string[])
      : [],
    target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
    slot_number: row.slotNumber,
    slot_capacity: row.slotCapacity,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * Mark a schedule live. When openWindowNow is true (admin Go live), starts the window immediately.
 * Works for slot and non-slot exams; does not require sequential slot ordering.
 */
export async function goLiveExamScheduleNow(
  admin: DbServiceClient,
  scheduleId: string,
  options?: { openWindowNow?: boolean },
): Promise<ExamScheduleRow> {
  const { data: existing, error: fetchErr } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new Error('Schedule not found');
  }

  const row = existing as ExamScheduleRow;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const openNow = options?.openWindowNow !== false;

  let startsAtIso = String(row.starts_at ?? now);
  if (openNow && scheduleStartMs(startsAtIso) > nowMs) {
    startsAtIso = now;
  }

  const normalizedEnd = normalizeEndsAtForGoLive(startsAtIso, row.ends_at ?? null);

  const patch: Record<string, unknown> = {
    status: 'live',
    updated_at: now,
    starts_at: startsAtIso,
  };
  if (normalizedEnd !== row.ends_at) {
    patch.ends_at = normalizedEnd;
  }

  const { data: updated, error: updateErr } = await admin
    .from('exam_schedules')
    .update(patch)
    .eq('id', scheduleId)
    .select('*')
    .single();

  if (!updateErr && updated) {
    return updated as ExamScheduleRow;
  }

  try {
    const prismaRow = await prisma.examSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'live',
        startsAt: new Date(startsAtIso),
        endsAt: normalizedEnd ? new Date(normalizedEnd) : null,
        targetDepartments: row.target_departments as Prisma.InputJsonValue,
        targetYears: row.target_years as Prisma.InputJsonValue,
      },
    });
    return mapPrismaExamScheduleRow(prismaRow);
  } catch (prismaErr) {
    const msg = updateErr?.message ?? (prismaErr instanceof Error ? prismaErr.message : 'Could not go live');
    throw new Error(msg);
  }
}

/** @deprecated Use goLiveExamScheduleNow — kept for ElevateX imports. */
export async function goLiveElevateXScheduleSlot(
  admin: DbServiceClient,
  scheduleId: string,
): Promise<ExamScheduleRow> {
  return goLiveExamScheduleNow(admin, scheduleId, { openWindowNow: true });
}

/** On publish, at most one slot — must be slot 1. */
export async function goLiveExamSchedulesForSlots(
  admin: DbServiceClient,
  requestId: string,
  slotNumbers: number[],
): Promise<{ updated: number }> {
  const nums = slotNumbers
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= EXAM_SLOT_COUNT);

  if (nums.length === 0) return { updated: 0 };
  if (nums.length > 1) {
    throw new Error('Only one slot can go live at a time. Open Slot 1 on publish, then Slot 2, and so on.');
  }
  if (nums[0] !== 1) {
    throw new Error('On publish, only Slot 1 can go live. Open Slot 2 and later from Exam schedules after Slot 1 ends.');
  }

  const { data: rows, error } = await admin
    .from('exam_schedules')
    .select('*')
    .eq('faculty_exam_request_id', requestId);

  if (error) throw new Error(error.message);

  const target = (rows ?? []).find(
    (r) => scheduleSlotNumber(r as ExamScheduleRow) === 1,
  );

  if (!target?.id) {
    throw new Error('Slot 1 schedule not found for this exam.');
  }

  await goLiveExamScheduleSlotSequential(admin, String(target.id));
  return { updated: 1 };
}

export function filterSchedulesForStudentSlots(
  schedules: ExamScheduleRow[],
  assignedSlotNumber: number | null,
): ExamScheduleRow[] {
  if (assignedSlotNumber == null) return schedules;
  const slotSchedules = schedules.filter(
    (s) => (s as ExamScheduleRow & { slot_number?: number }).slot_number === assignedSlotNumber,
  );
  return slotSchedules.length > 0 ? slotSchedules : schedules;
}

export type StudentSlotExamPortalNotice = {
  faculty_exam_request_id: string;
  exam_title: string;
  assigned_slot: number;
  headline: string;
  detail: string;
  tone: 'info' | 'warning';
};

export function formatSlotWindowLabel(slot: {
  exam_date?: string;
  start_time?: string;
  end_time?: string;
  starts_at?: string;
  ends_at?: string | null;
}): string {
  if (slot.exam_date?.trim() && slot.start_time?.trim() && slot.end_time?.trim()) {
    const date = new Date(`${slot.exam_date.trim()}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${date} · ${slot.start_time.trim()}–${slot.end_time.trim()}`;
  }

  if (slot.starts_at) {
    const startLabel = formatCollegeDateTime(slot.starts_at);
    if (startLabel !== '—') {
      if (slot.ends_at) {
        const endLabel = formatCollegeDateTime(slot.ends_at, {
          day: undefined,
          month: undefined,
          year: undefined,
          timeZoneName: undefined,
        });
        return `${startLabel} – ${endLabel}`;
      }
      return startLabel;
    }
  }

  return 'See examination schedule';
}

/** Portal card when the student's assigned slot is not open (includes wrong-slot-live case). */
export function resolveStudentSlotPortalNotice(input: {
  examTitle: string;
  facultyExamRequestId: string;
  assignedSlot: number;
  windowLabel: string;
  mySchedule: ExamScheduleRow | null;
  relatedSchedules: ExamScheduleRow[];
  now?: number;
}): StudentSlotExamPortalNotice | null {
  const now = input.now ?? Date.now();
  const slotNum = input.assignedSlot;
  const windowLabel = input.windowLabel.trim() || 'See examination schedule';
  const headlineBase = `Your slot: Slot ${slotNum} · ${windowLabel}`;

  const mySchedule =
    input.mySchedule ??
    input.relatedSchedules.find((s) => scheduleSlotNumber(s) === slotNum) ??
    null;

  if (mySchedule && isScheduleWindowOpen(mySchedule, now)) {
    return null;
  }

  const liveSchedules = input.relatedSchedules.filter((s) => isScheduleWindowOpen(s, now));
  const otherLive = liveSchedules.find((s) => scheduleSlotNumber(s) !== slotNum);

  if (otherLive) {
    const otherNum = scheduleSlotNumber(otherLive) ?? '?';
    return {
      faculty_exam_request_id: input.facultyExamRequestId,
      exam_title: input.examTitle,
      assigned_slot: slotNum,
      headline: `${headlineBase} · Not live yet`,
      detail: `Slot ${otherNum} is live right now. You can only start this exam during your assigned slot (Slot ${slotNum}).`,
      tone: 'warning',
    };
  }

  if (!mySchedule) {
    return {
      faculty_exam_request_id: input.facultyExamRequestId,
      exam_title: input.examTitle,
      assigned_slot: slotNum,
      headline: `${headlineBase} · Not live yet`,
      detail:
        'Your slot schedule is not published yet. Wait for the examination cell to open Slot ' +
        `${slotNum}.`,
      tone: 'info',
    };
  }

  if (mySchedule.status !== 'live') {
    return {
      faculty_exam_request_id: input.facultyExamRequestId,
      exam_title: input.examTitle,
      assigned_slot: slotNum,
      headline: `${headlineBase} · Not live yet`,
      detail: `Slot ${slotNum} has not been opened by the examination cell. Check back at your slot time.`,
      tone: 'info',
    };
  }

  const start = scheduleStartMs(mySchedule.starts_at);
  if (now < start) {
    return {
      faculty_exam_request_id: input.facultyExamRequestId,
      exam_title: input.examTitle,
      assigned_slot: slotNum,
      headline: `${headlineBase} · Not started yet`,
      detail: `Opens ${formatCollegeDateTime(mySchedule.starts_at)}. Log in at your slot time to begin.`,
      tone: 'info',
    };
  }

  return {
    faculty_exam_request_id: input.facultyExamRequestId,
    exam_title: input.examTitle,
    assigned_slot: slotNum,
    headline: `${headlineBase} · Window closed`,
    detail: 'Your slot time has ended. Contact your faculty or the examination cell if you need help.',
    tone: 'info',
  };
}

export async function buildStudentSlotExamPortalNotices(
  admin: DbServiceClient,
  input: {
    schedules: ExamScheduleRow[];
    department: string;
    year: string;
    rollNumber: string;
    examTitlesByRequestId: Map<string, string>;
    now?: number;
  },
): Promise<StudentSlotExamPortalNotice[]> {
  const roll = normalizeRoll(input.rollNumber);
  if (!roll) return [];

  const byRequest = new Map<string, ExamScheduleRow[]>();
  for (const schedule of input.schedules) {
    const requestId = schedule.faculty_exam_request_id;
    if (!requestId) continue;
    const list = byRequest.get(requestId) ?? [];
    list.push(schedule);
    byRequest.set(requestId, list);
  }

  if (byRequest.size === 0) return [];

  const requestIds = [...byRequest.keys()];
  const { data: requestRows } = await admin
    .from('faculty_exam_requests')
    .select('id, title, uses_slot_scheduling')
    .in('id', requestIds);

  const slotRequestIds = new Set(
    (requestRows ?? [])
      .filter((row) => Boolean(row.uses_slot_scheduling))
      .map((row) => String(row.id)),
  );

  const notices: StudentSlotExamPortalNotice[] = [];

  for (const requestId of requestIds) {
    if (!slotRequestIds.has(requestId)) continue;

    const related = byRequest.get(requestId) ?? [];
    if (!related.some((s) => scheduleMatchesStudent(s, input.department, input.year))) {
      continue;
    }

    const assignment = await findStudentSlotAssignment(admin, requestId, roll);
    if (!assignment) continue;

    const { slots } = await loadSlotsForRequest(admin, requestId);
    const parsed = enrichScheduleSlots(slots);
    const mySlotConfig = parsed.find((s) => s.slot_number === assignment.slot_number);
    const windowLabel = mySlotConfig
      ? formatSlotWindowLabel(mySlotConfig)
      : formatSlotWindowLabel({
          starts_at: related.find((s) => scheduleSlotNumber(s) === assignment.slot_number)
            ?.starts_at,
          ends_at:
            related.find((s) => scheduleSlotNumber(s) === assignment.slot_number)?.ends_at ?? null,
        });

    const mySchedule =
      related.find((s) => scheduleSlotNumber(s) === assignment.slot_number) ?? null;

    const examTitle =
      input.examTitlesByRequestId.get(requestId) ??
      requestRows?.find((r) => String(r.id) === requestId)?.title ??
      'Department examination';

    const notice = resolveStudentSlotPortalNotice({
      examTitle: String(examTitle),
      facultyExamRequestId: requestId,
      assignedSlot: assignment.slot_number,
      windowLabel,
      mySchedule,
      relatedSchedules: related,
      now: input.now,
    });

    if (notice) notices.push(notice);
  }

  return notices.sort((a, b) => a.assigned_slot - b.assigned_slot);
}
