import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import {
  buildAllLiveExamBoardsPrisma,
  buildAllLiveWritingActivityPrisma,
  buildLiveExamBoardPrisma,
  isElevateXSchedule,
  listLiveExamSchedulesPrisma,
  loadElevateXLiveSubmittedUserIdsPrisma,
  loadElevateXSessionSubmittedEntriesPrisma,
  mergeInProgressIntoLiveBoards,
  mergeInProgressIntoWritingNow,
  mergeSessionSubmittedIntoLiveBoards,
} from '@/lib/admin/live-dashboard-prisma';
import { loadAdminStudentsPrisma } from '@/lib/admin/attempts-rollup-prisma';
import { liveSessionSince } from '@/lib/admin/live-exam-session';
import {
  loadElevateXInProgressPrisma,
  type ElevateXInProgressRow,
} from '@/lib/admin/elevatex-results-prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get('scheduleId')?.trim() ?? '';

  const liveSchedules = await listLiveExamSchedulesPrisma();
  const elevatexSchedule = liveSchedules.find((s) => isElevateXSchedule(s)) ?? null;
  const sessionSince = elevatexSchedule ? liveSessionSince(elevatexSchedule) : undefined;

  const submittedFromDb =
    sessionSince != null
      ? await loadElevateXLiveSubmittedUserIdsPrisma(sessionSince)
      : new Set<string>();

  const [boardsRaw, writingRaw, elevatexInProgress, adminStudents] = await Promise.all([
    liveSchedules.length ? buildAllLiveExamBoardsPrisma(liveSchedules) : Promise.resolve([]),
    liveSchedules.length
      ? buildAllLiveWritingActivityPrisma(liveSchedules, {
          sessionSubmittedUserIds: submittedFromDb,
        })
      : Promise.resolve([]),
    liveSchedules.length
      ? loadElevateXInProgressPrisma({
          sessionSince,
          forceDuringLiveAdmin: true,
        })
      : Promise.resolve([] as ElevateXInProgressRow[]),
    sessionSince != null
      ? loadAdminStudentsPrisma()
      : Promise.resolve([] as Awaited<ReturnType<typeof loadAdminStudentsPrisma>>),
  ]);

  const sessionSubmittedEntries =
    sessionSince != null
      ? await loadElevateXSessionSubmittedEntriesPrisma(sessionSince, adminStudents)
      : [];

  const submittedUserIds = new Set(submittedFromDb);
  for (const b of boardsRaw) {
    for (const e of b.entries) {
      if (e.submitted_at) submittedUserIds.add(e.user_id);
    }
  }
  const boardsWithSubmitted = mergeSessionSubmittedIntoLiveBoards(
    boardsRaw,
    sessionSubmittedEntries,
    elevatexSchedule,
  );
  const boards = mergeInProgressIntoLiveBoards(
    boardsWithSubmitted,
    elevatexInProgress,
    submittedUserIds,
    elevatexSchedule,
  );
  const writing_now = mergeInProgressIntoWritingNow(
    writingRaw,
    elevatexInProgress,
    liveSchedules,
    submittedUserIds,
  );
  const partialByUser = new Map(
    elevatexInProgress.map((r) => [r.user_id, r.partial_score] as const),
  );
  const writingFiltered = writing_now
    .filter((r) => !submittedUserIds.has(r.user_id))
    .map((r) => ({
      ...r,
      score: Math.max(r.score, partialByUser.get(r.user_id) ?? 0),
    }));

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
