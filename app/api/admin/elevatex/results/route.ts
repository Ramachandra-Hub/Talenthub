import { NextResponse } from 'next/server';
import {
  loadElevateXAdminResultsPrisma,
  loadElevateXInProgressPrisma,
  loadElevateXResultsForDateKeyPrisma,
} from '@/lib/admin/elevatex-results-prisma';
import { getTodayDateKeyInIST } from '@/lib/admin/report-date-filter';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const todayKey = getTodayDateKeyInIST();
  const [rowsRaw, inProgress, todayRows] = await Promise.all([
    loadElevateXAdminResultsPrisma(),
    loadElevateXInProgressPrisma(),
    loadElevateXResultsForDateKeyPrisma(todayKey),
  ]);
  const rows = [...rowsRaw].sort(
    (a, b) =>
      new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime(),
  );
  const submitted = rows.filter((r) => r.submitted_at);
  const submittedUserIds = new Set(submitted.map((r) => r.user_id));
  const inProgressFiltered = inProgress.filter((r) => !submittedUserIds.has(r.user_id));

  return NextResponse.json({
    rows,
    in_progress: inProgressFiltered,
    today_key: todayKey,
    today_rows: todayRows,
    summary: {
      submitted_count: submitted.length,
      submitted_today_count: todayRows.length,
      in_progress_count: inProgressFiltered.length,
      with_scorecard: rows.filter((r) => r.has_full_scorecard).length,
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
