import {
  normalizeRoll,
  parseScheduleSlotsJson,
  scheduleSlotNumber,
} from '@/lib/exam-schedule-slots';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';

export type SlotRosterStudent = {
  roll_number: string;
  student_name: string | null;
  email: string | null;
  user_id: string | null;
};

export type SlotRosterResolution = {
  schedule_id: string;
  schedule_title: string;
  slot_number: number | null;
  faculty_exam_request_id: string | null;
  roster_count: number;
  matched_user_ids: string[];
  roster_rolls: string[];
  roster: SlotRosterStudent[];
};

type RawRosterRow = {
  roll_number: string;
  student_name: string | null;
  email: string | null;
};

function rollFromUser(email: string, rollNumber: string | null): string {
  const direct = rollNumber?.trim();
  if (direct) return normalizeRoll(direct);
  return normalizeRoll(rollNumberFromUser(email));
}

function inferSlotNumber(
  slotNumber: number | null,
  title: string | null,
): number | null {
  if (slotNumber != null && Number.isFinite(slotNumber) && slotNumber >= 1) {
    return Math.floor(slotNumber);
  }
  const row = { title: title ?? 'Exam', slot_number: null } as ExamScheduleRow;
  return scheduleSlotNumber(row);
}

function addRosterRow(map: Map<string, RawRosterRow>, row: RawRosterRow): void {
  const roll = normalizeRoll(row.roll_number);
  if (!roll) return;
  if (!map.has(roll)) {
    map.set(roll, {
      roll_number: roll,
      student_name: row.student_name,
      email: row.email,
    });
  }
}

async function loadRosterRowsForSchedule(schedule: {
  id: string;
  title: string | null;
  slotNumber: number | null;
  facultyExamRequestId: string | null;
}): Promise<RawRosterRow[]> {
  const slotNum = inferSlotNumber(schedule.slotNumber, schedule.title);
  const byRoll = new Map<string, RawRosterRow>();

  const slotRosterWhere =
    schedule.facultyExamRequestId && slotNum != null
      ? {
          OR: [
            { scheduleId: schedule.id },
            {
              facultyExamRequestId: schedule.facultyExamRequestId,
              slotNumber: slotNum,
            },
          ],
        }
      : schedule.facultyExamRequestId
        ? { facultyExamRequestId: schedule.facultyExamRequestId }
        : { scheduleId: schedule.id };

  const slotEntries = await prisma.examSlotRosterEntry.findMany({
    where: slotRosterWhere,
    select: {
      rollNumber: true,
      studentName: true,
      email: true,
      slotNumber: true,
    },
  });

  for (const entry of slotEntries) {
    if (slotNum != null && entry.slotNumber != null && entry.slotNumber !== slotNum) {
      continue;
    }
    addRosterRow(byRoll, {
      roll_number: entry.rollNumber,
      student_name: entry.studentName,
      email: entry.email,
    });
  }

  const studentRoster = await prisma.examStudentRoster.findMany({
    where: { scheduleId: schedule.id },
    select: { rollNumber: true, fullName: true },
  });

  for (const entry of studentRoster) {
    addRosterRow(byRoll, {
      roll_number: entry.rollNumber,
      student_name: entry.fullName,
      email: null,
    });
  }

  if (schedule.facultyExamRequestId && slotNum != null) {
    const request = await prisma.facultyExamRequest.findUnique({
      where: { id: schedule.facultyExamRequestId },
      select: { scheduleSlotsJson: true },
    });
    const slots = parseScheduleSlotsJson(request?.scheduleSlotsJson);
    const slot = slots.find((s) => s.slot_number === slotNum);
    for (const student of slot?.roster ?? []) {
      addRosterRow(byRoll, {
        roll_number: student.roll_number,
        student_name: student.student_name ?? null,
        email: student.email ?? null,
      });
    }
  }

  return [...byRoll.values()];
}

async function buildStudentRollIndex(): Promise<{
  byRoll: Map<string, string>;
  byEmail: Map<string, string>;
}> {
  const adminIds = new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );

  const students = await prisma.user.findMany({
    where: { userRole: { not: 'faculty' } },
    select: { id: true, email: true, rollNumber: true },
    take: 10000,
  });

  const byRoll = new Map<string, string>();
  const byEmail = new Map<string, string>();

  for (const user of students) {
    if (adminIds.has(user.id) || user.email.includes('@admin.')) continue;
    const roll = rollFromUser(user.email, user.rollNumber);
    if (roll && !byRoll.has(roll)) byRoll.set(roll, user.id);
    const email = user.email.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, user.id);
  }

  return { byRoll, byEmail };
}

/** Map exam schedule slot roster rolls to registered student user ids. */
export async function resolveSlotRosterUsers(
  scheduleId: string,
): Promise<SlotRosterResolution | { error: string }> {
  const schedule = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      title: true,
      slotNumber: true,
      facultyExamRequestId: true,
    },
  });
  if (!schedule) return { error: 'Exam schedule not found' };

  const slotNum = inferSlotNumber(schedule.slotNumber, schedule.title);
  const rawRoster = await loadRosterRowsForSchedule(schedule);
  const { byRoll, byEmail } = await buildStudentRollIndex();

  const matchedIds = new Set<string>();
  const rosterRolls = new Set<string>();

  const roster: SlotRosterStudent[] = rawRoster.map((entry) => {
    const roll = normalizeRoll(entry.roll_number);
    if (roll) rosterRolls.add(roll);
    const email = entry.email?.trim().toLowerCase() ?? null;
    const userId = (roll && byRoll.get(roll)) ?? (email && byEmail.get(email)) ?? null;
    if (userId) matchedIds.add(userId);
    return {
      roll_number: roll || entry.roll_number,
      student_name: entry.student_name,
      email: entry.email,
      user_id: userId,
    };
  });

  return {
    schedule_id: schedule.id,
    schedule_title: schedule.title ?? 'Exam schedule',
    slot_number: slotNum,
    faculty_exam_request_id: schedule.facultyExamRequestId,
    roster_count: roster.length,
    matched_user_ids: [...matchedIds],
    roster_rolls: [...rosterRolls],
    roster,
  };
}

async function countRosterForSchedule(schedule: {
  id: string;
  title: string | null;
  slotNumber: number | null;
  facultyExamRequestId: string | null;
}): Promise<number> {
  const rows = await loadRosterRowsForSchedule(schedule);
  return rows.length;
}

export async function listExamSlotScheduleOptions(): Promise<
  Array<{
    id: string;
    label: string;
    slot_number: number | null;
    status: string;
    starts_at: string | null;
    roster_count: number;
  }>
> {
  const schedules = await prisma.examSchedule.findMany({
    orderBy: { startsAt: 'desc' },
    take: 200,
    select: {
      id: true,
      title: true,
      slotNumber: true,
      status: true,
      startsAt: true,
      facultyExamRequestId: true,
    },
  });

  const counts = await Promise.all(
    schedules.map(async (schedule) => ({
      schedule,
      count: await countRosterForSchedule(schedule),
    })),
  );

  return counts
    .filter(
      ({ schedule, count }) =>
        count > 0 || schedule.slotNumber != null || /slot\s+\d+/i.test(schedule.title ?? ''),
    )
    .map(({ schedule, count }) => {
      const slotNum = inferSlotNumber(schedule.slotNumber, schedule.title);
      const slotLabel = slotNum != null ? `Slot ${slotNum}` : 'Schedule';
      const dateLabel = schedule.startsAt
        ? schedule.startsAt.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : '';
      return {
        id: schedule.id,
        label: [schedule.title ?? 'Exam', slotLabel, dateLabel].filter(Boolean).join(' · '),
        slot_number: slotNum,
        status: schedule.status,
        starts_at: schedule.startsAt?.toISOString() ?? null,
        roster_count: count,
      };
    });
}

export function userMatchesSlotRoster(
  user: { id: string; email: string; roll_number?: string | null },
  matchedUserIds: Set<string>,
  rosterRolls: Set<string>,
): boolean {
  if (matchedUserIds.has(user.id)) return true;
  const roll = rollFromUser(user.email, user.roll_number ?? null);
  return Boolean(roll && rosterRolls.has(roll));
}
