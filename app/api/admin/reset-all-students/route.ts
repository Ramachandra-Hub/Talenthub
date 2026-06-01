import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { resetAllStudentsForExamDay } from '@/lib/admin/reset-all-students';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const result = await resetAllStudentsForExamDay(admin);

  return NextResponse.json({
    ok: result.errors.length === 0,
    message:
      result.errors.length === 0
        ? `Removed ${result.authUsersDeleted} student/faculty login(s) and cleared all attempt data. Admin accounts kept.`
        : `Partial reset: ${result.authUsersDeleted} login(s) removed with ${result.errors.length} warning(s).`,
    ...result,
  });
}
