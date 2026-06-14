import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { prisma } from '@/lib/prisma';

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
  roster: SlotRosterStudent[];
};

function rollFromUser(
  email: string,
  rollNumber: string | null,
): string {
  const direct = rollNumber?.trim();
  if (direct) return normalizeRoll(direct);
  return normalizeRoll(rollNumberFromUser(email));
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

  const rosterWhere =
    schedule.facultyExamRequestId && schedule.slotNumber != null
      ? {
          OR: [
            { scheduleId: schedule.id },
            {
              facultyExamRequestId: schedule.facultyExamRequestId,
              slotNumber: schedule.slotNumber,
            },
          ],
        }
      : { scheduleId: schedule.id };

  const entries = await prisma.examSlotRosterEntry.findMany({
    where: rosterWhere,
    select: {
      rollNumber: true,
      studentName: true,
      email: true,
    },
    orderBy: [{ slotNumber: 'asc' }, { rollNumber: 'asc' }],
  });

  if (!entries.length) {
    return {
      schedule_id: schedule.id,
      schedule_title: schedule.title ?? 'Exam schedule',
      slot_number: schedule.slotNumber,
      faculty_exam_request_id: schedule.facultyExamRequestId,
      roster_count: 0,
      matched_user_ids: [],
      roster: [],
    };
  }

  const rosterRolls = new Set<string>();
  const rosterEmails = new Set<string>();
  for (const entry of entries) {
    const roll = normalizeRoll(entry.rollNumber);
    if (roll) rosterRolls.add(roll);
    const email = entry.email?.trim().toLowerCase();
    if (email) rosterEmails.add(email);
  }

  const adminIds = new Set(
    (await prisma.adminUser.findMany({ select: { userId: true } })).map((a) => a.userId),
  );

  const userWhereOr: Array<Record<string, unknown>> = [];
  if (rosterRolls.size) {
    userWhereOr.push({ rollNumber: { in: [...rosterRolls] } });
  }
  if (rosterEmails.size) {
    userWhereOr.push({ email: { in: [...rosterEmails], mode: 'insensitive' } });
  }

  const candidateUsers = userWhereOr.length
    ? await prisma.user.findMany({
        where: {
          userRole: { not: 'faculty' },
          OR: userWhereOr,
        },
        select: { id: true, email: true, rollNumber: true, fullName: true },
        take: 5000,
      })
    : [];

  const byRoll = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const user of candidateUsers) {
    if (adminIds.has(user.id) || user.email.includes('@admin.')) continue;
    const roll = rollFromUser(user.email, user.rollNumber);
    if (roll && !byRoll.has(roll)) byRoll.set(roll, user.id);
    const email = user.email.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, user.id);
  }

  const matchedIds = new Set<string>();
  const roster: SlotRosterStudent[] = entries.map((entry) => {
    const roll = normalizeRoll(entry.rollNumber);
    const email = entry.email?.trim().toLowerCase() ?? null;
    const userId = (roll && byRoll.get(roll)) ?? (email && byEmail.get(email)) ?? null;
    if (userId) matchedIds.add(userId);
    return {
      roll_number: roll || entry.rollNumber,
      student_name: entry.studentName,
      email: entry.email,
      user_id: userId,
    };
  });

  return {
    schedule_id: schedule.id,
    schedule_title: schedule.title ?? 'Exam schedule',
    slot_number: schedule.slotNumber,
    faculty_exam_request_id: schedule.facultyExamRequestId,
    roster_count: roster.length,
    matched_user_ids: [...matchedIds],
    roster,
  };
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

  const scheduleIds = schedules.map((s) => s.id);
  const requestIds = [
    ...new Set(schedules.map((s) => s.facultyExamRequestId).filter(Boolean)),
  ] as string[];

  const rosterCounts = new Map<string, number>();

  if (scheduleIds.length) {
    const bySchedule = await prisma.examSlotRosterEntry.groupBy({
      by: ['scheduleId'],
      where: { scheduleId: { in: scheduleIds } },
      _count: { _all: true },
    });
    for (const row of bySchedule) {
      if (row.scheduleId) rosterCounts.set(row.scheduleId, row._count._all);
    }
  }

  if (requestIds.length) {
    const entries = await prisma.examSlotRosterEntry.findMany({
      where: { facultyExamRequestId: { in: requestIds } },
      select: { facultyExamRequestId: true, slotNumber: true, scheduleId: true },
    });
    for (const schedule of schedules) {
      if (rosterCounts.get(schedule.id)) continue;
      const reqId = schedule.facultyExamRequestId;
      const slot = schedule.slotNumber;
      if (!reqId || slot == null) continue;
      const count = entries.filter(
        (e) =>
          e.facultyExamRequestId === reqId &&
          e.slotNumber === slot &&
          (!e.scheduleId || e.scheduleId === schedule.id),
      ).length;
      if (count > 0) rosterCounts.set(schedule.id, count);
    }
  }

  return schedules
    .filter((s) => (rosterCounts.get(s.id) ?? 0) > 0 || s.slotNumber != null)
    .map((s) => {
      const slotLabel = s.slotNumber != null ? `Slot ${s.slotNumber}` : 'Schedule';
      const dateLabel = s.startsAt
        ? s.startsAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      return {
        id: s.id,
        label: [s.title ?? 'Exam', slotLabel, dateLabel].filter(Boolean).join(' · '),
        slot_number: s.slotNumber,
        status: s.status,
        starts_at: s.startsAt?.toISOString() ?? null,
        roster_count: rosterCounts.get(s.id) ?? 0,
      };
    });
}
