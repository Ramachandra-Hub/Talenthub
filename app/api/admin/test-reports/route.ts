import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { parseAdminExamType } from '@/lib/admin/exam-type';
import { loadTestReportsPayload } from '@/lib/admin/test-reports-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const examType = parseAdminExamType(searchParams.get('examType'));
  const testId = searchParams.get('testId')?.trim() || undefined;
  const scheduleId = searchParams.get('scheduleId')?.trim() || undefined;
  const dateFilter =
    searchParams.get('date')?.trim() ||
    (searchParams.get('today') === '1' ? 'today' : undefined);
  const startDate = searchParams.get('startDate')?.trim() || undefined;
  const endDate = searchParams.get('endDate')?.trim() || undefined;

  if (examType === 'elevatex') {
    const { finalizeOpenElevateXAttemptsAfterExamPrisma } = await import(
      '@/lib/elevatex/exam-window'
    );
    await finalizeOpenElevateXAttemptsAfterExamPrisma().catch(() => undefined);
  }

  const payload = await loadTestReportsPayload(admin, examType, testId, scheduleId, {
    dateFilter: startDate ? undefined : dateFilter,
    startDate,
    endDate,
  });

  return NextResponse.json(payload);
}
