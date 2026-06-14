import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { ensureExamViolationsTableIfPossible } from '@/lib/ensure-exam-violations';
import { requireAuth } from '@/lib/server-auth';
import { loadProctoringViolations } from '@/lib/proctoring/proctoring-data';
import { enrichProctoringDisplayRows } from '@/lib/proctoring/proctoring-display';
import { rollNumberFromUser } from '@/lib/admin/roll-number';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  await ensureExamViolationsTableIfPossible();

  const fromDate = request.nextUrl.searchParams.get('from');
  const toDate = request.nextUrl.searchParams.get('to');

  const { violations, summary, dateRange } = await loadProctoringViolations(admin, {
    fromDate,
    toDate,
  });

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

  const rows = enrichProctoringDisplayRows(
    violations.map((row) => {
      const u = userMap.get(row.user_id);
      const email = (u?.email as string) ?? null;
      return {
        ...row,
        email,
        full_name: (u?.full_name as string) ?? null,
        branch: (u?.branch as string) ?? null,
        roll_number:
          (u?.roll_number as string)?.trim() ||
          (email ? rollNumberFromUser(email) : null) ||
          null,
      };
    }),
  );

  return NextResponse.json({
    violations: rows,
    summary,
    dateRange: {
      from: dateRange.fromDate,
      to: dateRange.toDate,
      from_iso: dateRange.fromIso,
      to_iso: dateRange.toIso,
    },
  });
}
