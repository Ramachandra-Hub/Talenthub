import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { cleanupExamsKeepToday } from '@/lib/exam-cleanup-keep-today';

export const maxDuration = 60;

/**
 * POST /api/admin/cleanup-exams-keep-today?apply=1
 * Keeps faculty/admin exams from today (IST); deletes older exam data.
 * ElevateX (placement_full) tests and attempts are never deleted.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const service = getDbService();
  if (!service) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const apply = url.searchParams.get('apply') === '1' || url.searchParams.get('apply') === 'true';

  const summary = await cleanupExamsKeepToday(service, { dryRun: !apply });

  return NextResponse.json({
    ...summary,
    message: apply
      ? `Deleted old exams. Kept ${summary.keptFacultyRequestIds.length} faculty request(s) from today (IST).`
      : `Dry-run: would delete ${summary.deletedFacultyRequestIds.length} faculty request(s). Add ?apply=1 to delete.`,
  });
}
