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
    ? await admin.from('users').select('id, email, full_name, branch, roll_number').in('id', userIds)
    : { data: [] };

  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]));

  for (const uid of userIds) {
    if (userMap.has(uid)) continue;
    const { data: authUser } = await admin.auth.admin.getUserById(uid);
    if (authUser?.user) {
      userMap.set(uid, {
        id: uid,
        email: authUser.user.email ?? '',
        full_name: (() => {
          const meta = authUser.user.user_metadata as Record<string, unknown>;
          return (
            (typeof meta.full_name === 'string' ? meta.full_name : null) ??
            (typeof meta.name === 'string' ? meta.name : null)
          );
        })(),
        branch: (() => {
          const meta = authUser.user.user_metadata as Record<string, unknown>;
          return (
            (typeof meta.branch === 'string' ? meta.branch : null) ??
            (typeof meta.department === 'string' ? meta.department : null)
          );
        })(),
        roll_number: (() => {
          const meta = authUser.user.user_metadata as Record<string, unknown>;
          const saved = (meta.prep_profile ?? {}) as Record<string, unknown>;
          return (
            (typeof saved.roll_number === 'string' ? saved.roll_number : null) ??
            (typeof meta.roll_number === 'string' ? meta.roll_number : null) ??
            (typeof meta.rollNumber === 'string' ? meta.rollNumber : null)
          );
        })(),
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
      roll_number: (u?.roll_number as string) ?? null,
    };
  });

  return NextResponse.json({
    violations: rows,
    summary,
  });
}
