import { NextResponse } from 'next/server';
import {
  loadElevateXAdminResultsPrisma,
  loadElevateXInProgressPrisma,
  loadElevateXResultsForDateKeyPrisma,
} from '@/lib/admin/elevatex-results-prisma';
import { getTodayDateKeyInIST } from '@/lib/admin/report-date-filter';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const sessionStartsAt = searchParams.get('sessionStartsAt')?.trim() ?? '';
  const sessionSinceMs = sessionStartsAt
    ? new Date(sessionStartsAt).getTime()
    : null;

  const todayKey = getTodayDateKeyInIST();
  const sessionSinceDate =
    sessionSinceMs != null && !Number.isNaN(sessionSinceMs)
      ? new Date(sessionSinceMs - 2 * 60 * 1000)
      : undefined;

  const [rowsRaw, inProgress, todayRows] = await Promise.all([
    loadElevateXAdminResultsPrisma({ liveMode: Boolean(sessionStartsAt) }),
    loadElevateXInProgressPrisma({
      sessionSince: sessionSinceDate,
      forceDuringLiveAdmin: Boolean(sessionStartsAt),
    }),
    loadElevateXResultsForDateKeyPrisma(todayKey),
  ]);

  let rows = rowsRaw;
  if (sessionSinceDate) {
    const cutoffMs = sessionSinceDate.getTime();
    rows = rowsRaw.filter((r) => {
      const at = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
      return at >= cutoffMs;
    });
  }
  const rowsSorted = [...rows]
    .filter((r) => r.submitted_at)
    .sort(
      (a, b) =>
        new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime(),
    );
  const submitted = rowsSorted;
  const submittedUserIds = new Set(submitted.map((r) => r.user_id));
  const inProgressFiltered = inProgress.filter((r) => !submittedUserIds.has(r.user_id));

  return NextResponse.json({
    rows: rowsSorted,
    in_progress: inProgressFiltered,
    today_key: todayKey,
    today_rows: todayRows,
    summary: {
      submitted_count: submitted.length,
      submitted_today_count: todayRows.length,
      in_progress_count: inProgressFiltered.length,
      with_scorecard: rowsSorted.filter((r) => r.has_full_scorecard).length,
      avg_score:
        submitted.length > 0
          ? Math.round(
              (submitted.reduce((a, r) => a + r.overall_score, 0) / submitted.length) * 100,
            ) / 100
          : 0,
    },
    refreshed_at: new Date().toISOString(),
  });
}
