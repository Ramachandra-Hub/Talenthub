import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { ensureExamViolationsTableIfPossible } from '@/lib/ensure-exam-violations';
import { requireAuth } from '@/lib/server-auth';
import { loadProctoringViolations } from '@/lib/proctoring/proctoring-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  await ensureExamViolationsTableIfPossible();

  const { violations, summary } = await loadProctoringViolations(admin);

  const userIds = [...new Set(violations.map((v) => v.user_id).filter(Boolean))];
  const { data: users } = userIds.length
    ? await admin.from('users').select('id, email, full_name, branch').in('id', userIds)
    : { data: [] };

  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]));

  for (const uid of userIds) {
    if (userMap.has(uid)) continue;
    const { data: authUser } = await admin.auth.admin.getUserById(uid);
    if (authUser?.user) {
      userMap.set(uid, {
        id: uid,
        email: authUser.user.email ?? '',
        full_name:
          (authUser.user.user_metadata?.full_name as string | undefined) ??
          (authUser.user.user_metadata?.name as string | undefined) ??
          null,
        branch:
          (authUser.user.user_metadata?.branch as string | undefined) ??
          (authUser.user.user_metadata?.department as string | undefined) ??
          null,
      });
    }
  }

  const rows = violations.map((row) => {
    const u = userMap.get(row.user_id);
    return {
      ...row,
      email: (u?.email as string) ?? null,
      full_name: (u?.full_name as string) ?? null,
      branch: (u?.branch as string) ?? null,
    };
  });

  return NextResponse.json({
    violations: rows,
    summary,
  });
}
