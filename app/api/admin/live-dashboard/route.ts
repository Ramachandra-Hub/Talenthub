import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  buildAllLiveExamBoardsPrisma,
  buildAllLiveWritingActivityPrisma,
  buildLiveExamBoardPrisma,
  isElevateXSchedule,
  listLiveExamSchedulesPrisma,
  mergeInProgressIntoLiveBoards,
  mergeInProgressIntoWritingNow,
} from '@/lib/admin/live-dashboard-prisma';
import { liveSessionSince } from '@/lib/admin/live-exam-session';
import { loadElevateXInProgressPrisma } from '@/lib/admin/elevatex-results-prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get('scheduleId')?.trim() ?? '';

  const liveSchedules = await listLiveExamSchedulesPrisma();
  const elevatexSchedule = liveSchedules.find((s) => isElevateXSchedule(s)) ?? null;
  const sessionSince = elevatexSchedule ? liveSessionSince(elevatexSchedule) : undefined;

  const [boardsRaw, writingRaw, elevatexInProgress] = await Promise.all([
    liveSchedules.length ? buildAllLiveExamBoardsPrisma(liveSchedules) : Promise.resolve([]),
    liveSchedules.length
      ? buildAllLiveWritingActivityPrisma(liveSchedules)
      : Promise.resolve([]),
    liveSchedules.length
      ? loadElevateXInProgressPrisma(
          sessionSince ? { sessionSince } : undefined,
        )
      : Promise.resolve([]),
  ]);

  const submittedUserIds = new Set(
    boardsRaw
      .flatMap((b) => b.entries)
      .filter((e) => e.submitted_at)
      .map((e) => e.user_id),
  );
  const boards = mergeInProgressIntoLiveBoards(
    boardsRaw,
    elevatexInProgress,
    submittedUserIds,
  );
  const writing_now = mergeInProgressIntoWritingNow(
    writingRaw,
    elevatexInProgress,
    liveSchedules,
    submittedUserIds,
  );
  const writingFiltered = writing_now.filter((r) => !submittedUserIds.has(r.user_id));

  const schedule =
    (scheduleId ? liveSchedules.find((s) => s.id === scheduleId) : null) ??
    liveSchedules[0] ??
    null;

  const board =
    (schedule ? boards.find((b) => b.schedule.id === schedule.id) : null) ??
    boards[0] ??
    (schedule ? await buildLiveExamBoardPrisma(schedule) : null);

  return NextResponse.json({
    live: liveSchedules.length > 0,
    schedules: liveSchedules,
    boards,
    ended_schedules: [],
    ended_boards: [],
    ended_reports: [],
    board,
    writing_now: writingFiltered,
    refreshed_at: new Date().toISOString(),
  });
}
