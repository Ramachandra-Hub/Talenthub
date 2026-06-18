import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatSlotAttemptLabel, normalizeAttemptRound } from '@/lib/exam-attempt-round';
import type { ExamScheduleRow } from '@/lib/exam-schedule';

function mapScheduleRow(row: {
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
  attemptRound: number;
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
    attempt_round: normalizeAttemptRound(row.attemptRound),
    slot_capacity: row.slotCapacity,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Clone a slot schedule as the next attempt round (keeps roster; prior attempts stay in DB). */
export async function openNextAttemptRoundForSchedule(input: {
  scheduleId: string;
  adminUserId: string;
  startsAt?: string | null;
  endsAt?: string | null;
  goLiveNow?: boolean;
}): Promise<{ schedule: ExamScheduleRow; attempt_round: number; message: string }> {
  const source = await prisma.examSchedule.findUnique({
    where: { id: input.scheduleId.trim() },
  });
  if (!source) {
    throw new Error('Schedule not found.');
  }
  if (source.slotNumber == null) {
    throw new Error('Re-attempt rounds are only supported for slot-based exam schedules.');
  }
  if (!source.facultyExamRequestId) {
    throw new Error('This schedule is not linked to a faculty exam.');
  }

  const slotNumber = source.slotNumber;
  const facultyExamRequestId = source.facultyExamRequestId;

  const agg = await prisma.examSchedule.aggregate({
    where: { facultyExamRequestId, slotNumber },
    _max: { attemptRound: true },
  });
  const nextRound = normalizeAttemptRound(agg._max.attemptRound) + 1;

  const now = new Date();
  const startsAt = input.startsAt ? new Date(input.startsAt) : source.startsAt ?? now;
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error('Invalid start time.');
  }
  const endsAt =
    input.endsAt === null
      ? null
      : input.endsAt
        ? new Date(input.endsAt)
        : source.endsAt;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new Error('Invalid end time.');
  }

  await prisma.examSchedule.updateMany({
    where: {
      facultyExamRequestId,
      slotNumber,
      status: 'live',
    },
    data: {
      status: 'ended',
      endsAt: now,
      updatedAt: now,
    },
  });

  const baseTitle = (source.title ?? 'Exam').replace(/\s*·\s*Attempt\s+\d+$/i, '').trim();
  const title = formatSlotAttemptLabel(slotNumber, nextRound, baseTitle);
  const status = input.goLiveNow ? 'live' : 'scheduled';

  const created = await prisma.examSchedule.create({
    data: {
      title,
      description: source.description,
      notice: source.notice,
      facultyExamRequestId,
      testId: source.testId,
      status,
      startsAt: input.goLiveNow ? now : startsAt,
      endsAt: endsAt ?? undefined,
      targetDepartments: source.targetDepartments as Prisma.InputJsonValue,
      targetYears: source.targetYears as Prisma.InputJsonValue,
      slotNumber,
      attemptRound: nextRound,
      slotCapacity: source.slotCapacity,
      createdBy: input.adminUserId,
    },
  });

  return {
    schedule: mapScheduleRow(created),
    attempt_round: nextRound,
    message: `Opened ${formatSlotAttemptLabel(slotNumber, nextRound)}. Students who completed the earlier round can write again; prior attempts are kept in reports.`,
  };
}
