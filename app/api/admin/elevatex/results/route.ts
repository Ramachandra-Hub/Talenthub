import { NextResponse } from 'next/server';
import {
  loadElevateXAdminResultsPrisma,
  loadElevateXInProgressPrisma,
} from '@/lib/admin/elevatex-results-prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const [rows, inProgress] = await Promise.all([
    loadElevateXAdminResultsPrisma(),
    loadElevateXInProgressPrisma(),
  ]);
  const submitted = rows.filter((r) => r.submitted_at);

  return NextResponse.json({
    rows,
    in_progress: inProgress,
    summary: {
      submitted_count: submitted.length,
      in_progress_count: inProgress.length,
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
