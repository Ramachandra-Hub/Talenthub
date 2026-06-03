import { NextResponse } from 'next/server';
import { loadElevateXResultsForDateKeyPrisma } from '@/lib/admin/elevatex-results-prisma';
import {
  getTodayDateKeyInIST,
  parseReportDateFilter,
} from '@/lib/admin/report-date-filter';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = parseReportDateFilter(searchParams.get('date') ?? 'today');
  const dateKey = parsed?.dateKey ?? getTodayDateKeyInIST();
  const rows = await loadElevateXResultsForDateKeyPrisma(dateKey);
  const submitted = rows.filter((r) => r.submitted_at);

  return NextResponse.json({
    date_key: dateKey,
    date_label: parsed?.label ?? dateKey,
    rows: submitted.sort(
      (a, b) =>
        new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime(),
    ),
    summary: {
      submitted_count: submitted.length,
      avg_score:
        submitted.length > 0
          ? Math.round(
              (submitted.reduce((a, r) => a + r.overall_score, 0) / submitted.length) * 100,
            ) / 100
          : 0,
      with_scorecard: submitted.filter((r) => r.has_full_scorecard).length,
    },
    refreshed_at: new Date().toISOString(),
  });
}
