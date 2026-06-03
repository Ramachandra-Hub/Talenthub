import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  buildAllLiveExamBoardsPrisma,
  buildAllLiveWritingActivityPrisma,
  buildLiveExamBoardPrisma,
  listLiveExamSchedulesPrisma,
  mergeInProgressIntoLiveBoards,
  mergeInProgressIntoWritingNow,
} from '@/lib/admin/live-dashboard-prisma';
import { prisma } from '@/lib/prisma';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import { isElevateXModule } from '@/lib/elevatex';
import {
  loadElevateXAdminResultsPrisma,
  loadElevateXInProgressPrisma,
} from '@/lib/admin/elevatex-results-prisma';

export const dynamic = 'force-dynamic';

function mapEndedSchedule(row: {
  id: string;
  testId: string | null;
  title: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetDepartments: unknown;
  targetYears: unknown;
  slotNumber: number | null;
}): ExamScheduleRow {
  return {
    id: row.id,
    test_id: row.testId ?? '',
    title: row.title ?? 'Exam',
    status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
    starts_at: row.startsAt?.toISOString() ?? new Date().toISOString(),
    ends_at: row.endsAt?.toISOString() ?? null,
    target_departments: (row.targetDepartments as string[]) ?? [],
    target_years: (row.targetYears as string[]) ?? [],
    description: null,
    notice: null,
    faculty_exam_request_id: null,
    slot_number: row.slotNumber,
    slot_capacity: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function listRecentlyEndedExamSchedulesPrisma(): Promise<ExamScheduleRow[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [rows, moduleRows] = await Promise.all([
    prisma.examSchedule.findMany({
      where: {
        OR: [{ status: 'ended' }, { endsAt: { lt: new Date(), gte: cutoff } }],
      },
      orderBy: { endsAt: 'desc' },
      take: 20,
    }),
    prisma.evaloraModuleSchedule.findMany({
      where: {
        OR: [{ status: 'ended' }, { endsAt: { lt: new Date(), gte: cutoff } }],
      },
      orderBy: { endsAt: 'desc' },
      take: 20,
    }),
  ]);
  const mapped = rows.map(mapEndedSchedule);
  for (const row of moduleRows) {
    mapped.push({
      id: row.id,
      test_id: row.moduleKey,
      title:
        row.title?.trim() ||
        (isElevateXModule(row.moduleKey) ? 'ElevateX' : row.moduleKey.replace(/_/g, ' ')),
      status: row.status === 'live' || row.status === 'ended' ? row.status : 'scheduled',
      starts_at: row.startsAt.toISOString(),
      ends_at: row.endsAt?.toISOString() ?? null,
      target_departments: Array.isArray(row.targetDepartments)
        ? (row.targetDepartments as string[])
        : [],
      target_years: Array.isArray(row.targetYears) ? (row.targetYears as string[]) : [],
      description: null,
      notice: row.notice ?? null,
      faculty_exam_request_id: null,
      slot_number: null,
      slot_capacity: null,
      created_by: row.createdBy ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
  return mapped.sort(
    (a, b) =>
      new Date(b.ends_at ?? b.starts_at).getTime() -
      new Date(a.ends_at ?? a.starts_at).getTime(),
  );
}

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get('scheduleId')?.trim() ?? '';

  const [liveSchedules, endedSchedules] = await Promise.all([
    listLiveExamSchedulesPrisma(),
    listRecentlyEndedExamSchedulesPrisma(),
  ]);

  const [boardsRaw, endedBoardsRaw, writingRaw, elevatexSubmitted, elevatexInProgress] =
    await Promise.all([
      liveSchedules.length ? buildAllLiveExamBoardsPrisma(liveSchedules) : Promise.resolve([]),
      endedSchedules.length ? buildAllLiveExamBoardsPrisma(endedSchedules) : Promise.resolve([]),
      liveSchedules.length ? buildAllLiveWritingActivityPrisma(liveSchedules) : Promise.resolve([]),
      loadElevateXAdminResultsPrisma(),
      loadElevateXInProgressPrisma(),
    ]);

  const submittedUserIds = new Set(
    elevatexSubmitted.filter((r) => r.submitted_at).map((r) => r.user_id),
  );
  const inProgressFiltered = elevatexInProgress.filter((r) => !submittedUserIds.has(r.user_id));
  const boards = mergeInProgressIntoLiveBoards(boardsRaw, inProgressFiltered, submittedUserIds);
  const endedBoards = mergeInProgressIntoLiveBoards(
    endedBoardsRaw,
    inProgressFiltered,
    submittedUserIds,
  );
  const writing_now = mergeInProgressIntoWritingNow(
    writingRaw,
    inProgressFiltered,
    liveSchedules,
    submittedUserIds,
  );
  const writingFiltered = writing_now.filter((r) => !submittedUserIds.has(r.user_id));
  const hasElevateXActivity = inProgressFiltered.length > 0 || writingFiltered.length > 0;

  const schedule =
    (scheduleId ? liveSchedules.find((s) => s.id === scheduleId) : null) ??
    (scheduleId ? endedSchedules.find((s) => s.id === scheduleId) : null) ??
    liveSchedules[0] ??
    endedSchedules[0] ??
    null;

  const board =
    (schedule
      ? [...boards, ...endedBoards].find((b) => b.schedule.id === schedule.id)
      : null) ??
    boards[0] ??
    endedBoards[0] ??
    (schedule ? await buildLiveExamBoardPrisma(schedule) : null);

  const ended_reports = endedSchedules.map((s) => ({
    schedule_id: s.id,
    slot_number: s.slot_number ?? null,
    title: s.title,
    test_id: String(s.test_id ?? ''),
    exam_type: (isElevateXModule(s.test_id) || /elevatex/i.test(s.title)
      ? 'elevatex'
      : 'department') as const,
    ends_at: s.ends_at,
  }));

  return NextResponse.json({
    live: liveSchedules.length > 0 || hasElevateXActivity,
    schedules: liveSchedules,
    boards,
    ended_schedules: endedSchedules,
    ended_boards: endedBoards,
    ended_reports,
    board,
    writing_now: writingFiltered,
    elevatex_submitted_count: elevatexSubmitted.length,
    elevatex_in_progress_count: inProgressFiltered.length,
    refreshed_at: new Date().toISOString(),
  });
}
